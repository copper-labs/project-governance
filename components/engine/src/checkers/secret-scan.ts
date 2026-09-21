import { execFileSync, spawn } from "node:child_process";
import { constants, createReadStream, existsSync, fstatSync, lstatSync, openSync, closeSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnySchema } from "ajv";
import { safeSubjectPath, readSubjectSource, type ChangeScope, type SubjectSource } from "../change-subject.ts";
import type { Finding } from "../checker-results.ts";
import { scanSecretChunks, secretResult, secretWaivers, type SecretScan } from "./secrets.ts";

const gitEnv = () => ({ ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" });
const decode = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
function query(root: string, args: string[]): Buffer {
  return execFileSync("git", args, { cwd: root, env: gitEnv(), timeout: 30_000, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function hasGitMetadata(root: string): boolean {
  if (process.env["GIT_DIR"]) return true;
  for (let path = root;; path = dirname(path)) {
    if (existsSync(join(path, ".git"))) return true;
    if (dirname(path) === path) return false;
  }
}

/** Exhaustive discovery includes index-only files; Git failures cannot degrade into a filesystem-only scan. */
function allSources(root: string): { paths: string[]; blobs: Array<{ path: string; oid: string }> } {
  let repository = false;
  try { repository = decode(query(root, ["rev-parse", "--is-inside-work-tree"])).trim() === "true"; }
  catch { if (hasGitMetadata(root)) throw new Error("Git repository discovery failed"); }
  if (repository) {
    const paths = [...new Set(decode(query(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).map(safeSubjectPath))].sort();
    const blobs = decode(query(root, ["ls-files", "--stage", "-z"])).split("\0").filter(Boolean).flatMap(line => {
      const tab = line.indexOf("\t"), metadata = line.slice(0, tab).split(" "), path = safeSubjectPath(line.slice(tab + 1));
      if (tab < 0 || metadata.length !== 3 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(metadata[1]!)) throw new Error("Git returned malformed staged-index metadata");
      return metadata[0]!.startsWith("100") ? [{ path, oid: metadata[1]! }] : [];
    });
    return { paths, blobs };
  }
  const paths: string[] = [];
  const visit = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.isSymbolicLink()) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), path);
      else if (entry.isFile()) paths.push(safeSubjectPath(path));
    }
  };
  visit(root, ""); return { paths: paths.sort(), blobs: [] };
}

/** Scan regular files through a no-follow descriptor, with bounded stream chunks rather than full-file buffers. */
async function scanFile(root: string, path: string): Promise<SecretScan | null> {
  safeSubjectPath(path);
  let component = root;
  for (const part of path.split("/").slice(0, -1)) {
    component = join(component, part);
    try { if (lstatSync(component).isSymbolicLink()) throw new Error("scan cannot traverse an intermediate symlink"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  const absolute = join(root, path);
  let fd: number;
  try {
    if (!lstatSync(absolute).isFile()) return null;
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!fstatSync(fd).isFile()) { closeSync(fd); return null; }
  const stream = createReadStream(absolute, { fd, autoClose: true, highWaterMark: 64 * 1024 });
  try { return await scanSecretChunks(stream); } finally { stream.destroy(); }
}

/** Read a pinned blob with replacement refs disabled; process failure invalidates even an empty scan. */
async function scanBlob(root: string, oid: string): Promise<SecretScan> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) throw new Error("invalid Git blob identity");
  const child = spawn("git", ["cat-file", "blob", oid], { cwd: root, env: gitEnv(), stdio: ["ignore", "pipe", "ignore"] });
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("Git blob process failed to start")));
    child.once("close", code => code === 0 ? resolve() : reject(new Error("Git blob process did not complete")));
  });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try { const [scan] = await Promise.all([scanSecretChunks(child.stdout!), exit]); return scan; }
  catch (error) { child.kill("SIGKILL"); await exit.catch(() => {}); throw error; }
  finally { clearTimeout(deadline); }
}

async function scanPinned(root: string, source: SubjectSource): Promise<SecretScan> {
  if (source.kind !== "worktree") return scanBlob(root, source.identity);
  const result = source.file_type === "symlink" ? await scanSecretChunks([readSubjectSource(root, source)]) : await scanFile(root, source.path);
  if (!result || `sha256:${result.sha256}` !== source.identity) throw new Error("selected after-image changed before secret scan completed");
  return result;
}

/** A full scan unions live and staged content. Narrow checks use the exact captured after-images only. */
export async function checkSecrets(root: string, options: { scope: ChangeScope; waiverRegistry: unknown; waiverSchema: AnySchema; today: string }) {
  root = realpathSync(root);
  const { waivers, findings } = secretWaivers(options.waiverRegistry, options.waiverSchema, options.today);
  const images: Array<{ path: string; scan: SecretScan }> = [];
  const failed = (path: string, detail: string) => findings.push({ rule_id: "security.scan-unavailable", severity: "blocking", message: `${path}: ${detail}` } as Finding);
  try {
    if (options.scope.scope === "all") {
      const sources = allSources(root);
      for (const path of sources.paths) {
        try { const scan = await scanFile(root, path); if (scan) images.push({ path, scan }); }
        catch { failed(path, "working-tree content could not be scanned"); }
      }
      const scans = new Map<string, SecretScan>();
      for (const { path, oid } of sources.blobs) {
        try { let scan = scans.get(oid); if (!scan) { scan = await scanBlob(root, oid); scans.set(oid, scan); } images.push({ path, scan }); }
        catch { failed(path, "staged index blob could not be scanned"); }
      }
    } else {
      for (const record of options.scope.records) if (record.after) {
        try { images.push({ path: record.path, scan: await scanPinned(root, record.after) }); }
        catch { failed(record.path, "packet after-image could not be scanned"); }
      }
    }
  } catch { failed("repository", "repository discovery could not be completed"); }
  return secretResult(images, waivers, findings);
}
