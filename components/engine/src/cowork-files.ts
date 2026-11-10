import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeSubjectPath, worktreeBytes } from "./change-subject.ts";
import { governanceAuthorityPath } from "./startup-git.ts";

const MAX_FILE = 1024 * 1024;
const MAX_BATCH = 4 * MAX_FILE;
const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export interface CoworkEdit { path: string; expected: string; text?: string; delete?: true }

/** Explicit editing permits lockfiles, but never grants runtime or credential authority. */
export function coworkFilePath(path: string): string {
  safeSubjectPath(path);
  const parts = path.toLowerCase().split("/"), name = parts.at(-1)!;
  if (/[\x00-\x1f\\]/u.test(path) || governanceAuthorityPath(path) ||
      ["agents.md", "agents.override.md", "claude.md", "gemini.md", "tools/governance-bootstrap.py", "tools/governance-startup.py"].includes(path.toLowerCase()) ||
      ["config/governance/", "config/validation/"].some(prefix => path.toLowerCase().startsWith(prefix)) ||
      parts.some(part => [".git", ".governance", ".harness", ".codex", ".claude", ".agents", ".githooks", "secrets", "credentials"].includes(part)) ||
      /^(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519)|\.npmrc|\.netrc)$/u.test(name) ||
      /\.(?:pem|key|p12|pfx|keystore|sqlite|db)$/u.test(name)) throw new Error("cowork-file-path-denied");
  return path;
}

function inspectParents(root: string, path: string, create = false) {
  let parent = root;
  for (const part of path.split("/").slice(0, -1)) {
    parent = join(parent, part);
    let info = lstatSync(parent, { throwIfNoEntry: false });
    if (!info && create) {
      try { mkdirSync(parent, { mode: 0o755 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      info = lstatSync(parent);
    }
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error("cowork-file-parent-invalid");
  }
}

function snapshot(root: string, path: string) {
  coworkFilePath(path);
  inspectParents(root, path);
  try {
    const info = lstatSync(join(root, path));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("cowork-file-type-invalid");
    const { bytes, type } = worktreeBytes(root, path, MAX_FILE);
    if (type !== "regular") throw new Error("cowork-file-type-invalid");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("cowork-file-not-text");
    return { identity: hash(bytes), bytes, text, mode: info.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { identity: "absent", bytes: Buffer.alloc(0), text: "", mode: 0o644 };
  }
}

export function coworkFileIdentity(workspace: string, path: string): string {
  return snapshot(realpathSync(workspace), path).identity;
}

export function coworkFileRead(workspace: string, path: string, offset = 0, length = 32_768) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 65_536)
    throw new Error("cowork-file-page-invalid");
  const file = snapshot(realpathSync(workspace), path);
  if (file.identity === "absent") throw new Error("cowork-file-absent");
  // Offsets are Unicode code points; each page is valid text, including non-BMP characters.
  const points = Array.from(file.text), end = Math.min(points.length, offset + length);
  return { path, sha256: file.identity, size_bytes: file.bytes.length, offset, offset_unit: "unicode-code-point",
    text: points.slice(offset, end).join(""), next_offset: end < points.length ? end : null };
}

/** The caller validates task/version and records all write intents before the first mutation. */
export function coworkFileApply(workspace: string, edits: readonly CoworkEdit[], recordIntents: (paths: string[]) => void) {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > 64) throw new Error("cowork-file-batch-invalid");
  const root = realpathSync(workspace), seen = new Set<string>();
  let total = 0;
  const prepared = edits.map(edit => {
    if (!edit || typeof edit.path !== "string" || typeof edit.expected !== "string" ||
        !/^(?:absent|sha256:[a-f0-9]{64})$/u.test(edit.expected) || seen.has(edit.path) ||
        Object.keys(edit).some(key => !["path", "expected", "text", "delete"].includes(key)) ||
        (edit.delete === true ? edit.text !== undefined : edit.delete !== undefined || typeof edit.text !== "string"))
      throw new Error("cowork-file-edit-invalid");
    seen.add(edit.path);
    const bytes = edit.text === undefined ? null : Buffer.from(edit.text, "utf8");
    if (bytes && (bytes.length > MAX_FILE || bytes.includes(0) || bytes.toString("utf8") !== edit.text))
      throw new Error("cowork-file-text-invalid");
    total += bytes?.length ?? 0;
    if (total > MAX_BATCH) throw new Error("cowork-file-batch-too-large");
    const prior = snapshot(root, edit.path);
    if (prior.identity !== edit.expected || (edit.delete && prior.identity === "absent")) throw new Error("cowork-file-conflict");
    return { edit, bytes, prior };
  });
  const paths = prepared.map(item => item.edit.path.toLowerCase());
  if (new Set(paths).size !== paths.length || paths.some(path => paths.some(other => other !== path && other.startsWith(path + "/"))))
    throw new Error("cowork-file-overlapping-paths");
  recordIntents(prepared.map(item => item.edit.path));
  const results: Array<{ path: string; state: "applied" | "failed" | "not-attempted"; identity?: string }> = [];
  let failed = false;
  for (const { edit, bytes, prior } of prepared) {
    if (failed) { results.push({ path: edit.path, state: "not-attempted" }); continue; }
    let temporary: string | undefined;
    try {
      if (snapshot(root, edit.path).identity !== edit.expected) throw new Error("cowork-file-conflict");
      if (bytes === null) unlinkSync(join(root, edit.path));
      else {
        inspectParents(root, edit.path, true);
        temporary = join(dirname(join(root, edit.path)), `.governance-edit-${randomUUID()}`);
        writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
        chmodSync(temporary, prior.mode);
        if (snapshot(root, edit.path).identity !== edit.expected) throw new Error("cowork-file-conflict");
        renameSync(temporary, join(root, edit.path)); temporary = undefined;
      }
      results.push({ path: edit.path, state: "applied", identity: bytes === null ? "absent" : hash(bytes) });
    } catch {
      failed = true; results.push({ path: edit.path, state: "failed" });
    } finally {
      if (temporary) { try { unlinkSync(temporary); } catch { /* Report failure without touching other paths. */ } }
    }
  }
  return { ok: !failed, results, retry: failed ? "reread-before-retry" : null };
}
