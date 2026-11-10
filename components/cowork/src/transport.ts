import { coworkHostPath } from "../../engine/src/cowork-environment.ts";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { runtimeTree } from "../../engine/src/runtime-tree.ts";
import type { CoworkRegistration } from "../../engine/src/cowork-registration.ts";
import { parseCoworkRequest } from "../../engine/src/cowork-request.ts";
const directory = () => join(homedir(), "Library", "Application Support", "Project Governance", "cowork");
function privateFile(path: string) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536 || info.mode & 0o077 || info.uid !== process.getuid?.())
    throw new Error("Registration must be a private file owned by this Mac user. Run setup again.");
  return JSON.parse(readFileSync(path, "utf8")) as CoworkRegistration;
}
export function registrationInventory() {
  let names: string[];
  try { names = readdirSync(directory()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { valid: [], problems: [] };
    throw new Error("Cannot read Governance registrations. Run setup again.");
  }
  if (names.length > 256) throw new Error("Registration inventory exceeds supported limit.");
  const valid: CoworkRegistration[] = [];
  const problems: Array<{ project_id: string; status: string; next: string }> = [];
  for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/u.test(name))) {
    try {
      const value = privateFile(join(directory(), name));
      if (value.version !== 1 || name !== `${value.project_id}.json` ||
          ![value.workspace, value.node, value.coordinator, value.registry, value.directory].every(path => typeof path === "string" && isAbsolute(path)) ||
          typeof value.label !== "string" || typeof value.locator !== "string" || typeof value.runtime_version !== "string" ||
          !Number.isSafeInteger(value.revision) || typeof value.lock_digest !== "string" || typeof value.tree_digest !== "string")
        throw new Error("invalid registration");
      valid.push(value);
    } catch {
      problems.push({ project_id: name.slice(0, -5), status: "needs-setup", next: "Run Governance Cowork setup in this project." });
    }
  }
  return { valid, problems };
}
export function registrations() { return registrationInventory().valid; }
export async function invokeRegistered(operation: string, input: Record<string, unknown>) {
  parseCoworkRequest(operation, input);
  if (operation === "register") throw new Error("Registration requires local operator setup.");
  const projects = registrations(), project = projects.find(item => item.project_id === input.project_id);
  if (!project) throw new Error("Project is not registered. Run Governance Cowork setup in the project.");
  try {
  if (realpathSync(project.workspace) !== project.workspace || realpathSync(project.node) !== project.node || realpathSync(project.directory) !== project.directory)
    throw new Error("Registered paths moved. Run setup again.");
  for (const owner of projects) for (const path of [project.node, project.registry, project.directory, directory()]) {
    const rel = relative(owner.workspace, path);
    if (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) throw new Error("Runtime authority overlaps a registered project.");
  }
  const packageRoot = join(project.directory, "node_modules/@organta/project-governance");
  if (project.coordinator !== join(packageRoot, "dist/engine/src/cli.js") || runtimeTree(packageRoot).digest !== project.tree_digest)
    throw new Error("Registered runtime changed. Verify the installation and run setup again.");
  } catch { throw new Error("Registered runtime changed or moved. Run Governance Cowork setup again."); }
  const allowed = new Set(["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "DEVELOPER_DIR", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "XDG_STATE_HOME"]);
  if (!project.environment || Object.entries(project.environment).some(([key, value]) => !allowed.has(key) || typeof value !== "string" || value.includes("\0")))
    throw new Error("Registration environment is invalid. Run setup again.");
  const hostPath = coworkHostPath(project.environment.PATH ?? "", projects.map(item => item.workspace));
  return await new Promise<unknown>((resolve, reject) => {
    const child = spawn(project.node, [project.coordinator, "runtime-run", "--registry", project.registry,
      "--workspace", project.workspace, "--", "cowork", operation], { cwd: project.workspace,
      env: { ...project.environment, PATH: hostPath, GOVERNANCE_COWORK_LOCATOR: project.locator, GOVERNANCE_COWORK_REVISION: String(project.revision), GOVERNANCE_COWORK_LOCK_DIGEST: project.lock_digest, HARNESS_SESSION: typeof input.session === "string" ? input.session : "" },
      stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = []; let size = 0, overflow = false;
    child.stdout.on("data", (bytes: Buffer) => {
      size += bytes.length;
      if (size > 2 * 1024 * 1024) { overflow = true; child.kill("SIGTERM"); return; }
      output.push(bytes);
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error("Native Governance could not start. Verify Node and run setup again.")));
    child.stdin.on("error", () => {});
    child.once("close", code => {
      if (overflow) { reject(new Error("Governance output exceeded its delivery limit; inspect the native result.")); return; }
      try { const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(output))); if (code !== 0 && (!result || typeof result !== "object" || !("code" in result))) reject(new Error("Governance refused the operation. Verify registration and inspect the native result.")); else resolve(result); }
      catch { reject(new Error("Governance did not return a valid result. No automatic retry was made.")); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
