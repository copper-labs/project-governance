import { coworkHostPath } from "./cowork-environment.ts";
import { randomUUID, createHash } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { providerRuntime } from "./provider-runtime.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { workContext } from "../../harness/src/store/location.ts";

export interface CoworkRegistration {
  version: 1; project_id: string; label: string; workspace: string; locator: string;
  node: string; coordinator: string; registry: string; directory: string; revision: number;
  runtime_version: string; lock_digest: string; tree_digest: string; environment: Record<string, string>;
}
export function coworkRegistrationDirectory() {
  return join(homedir(), "Library", "Application Support", "Project Governance", "cowork");
}
function outside(path: string, workspace: string) {
  const rel = relative(workspace, path);
  return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
}
/** Run only through the operator's installed launcher, never as a model-callable tool. */
export function registerCoworkProject(workspace: string, label: string) {
  if (!label.trim() || label.length > 160 || /[\x00-\x1f]/u.test(label)) throw new Error("cowork-registration-label-invalid");
  const binding = providerRuntime(workspace);
  if (!binding || binding.root !== realpathSync(workspace)) throw new Error("cowork-registration-needs-project-root");
  const installed = inspectRuntimeGeneration(binding.directory);
  const node = realpathSync(process.execPath), coordinator = String(installed.executable);
  const launcher = join(binding.root, ".governance/runtime/bin/project-governance");
  if (realpathSync(launcher) !== launcher || narrativeFile(binding.root, launcher) !== runtimeLauncher(node, coordinator, binding.registry, binding.root))
    throw new Error("cowork-registration-launcher-mismatch");
  const directory = coworkRegistrationDirectory();
  for (const path of [node, coordinator, binding.registry, binding.directory, directory])
    if (!outside(path, binding.root)) throw new Error("cowork-registration-authority-inside-project");
  const context = workContext(binding.root), environment: Record<string, string> = {};
  for (const name of ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "DEVELOPER_DIR", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "XDG_STATE_HOME"])
    if (process.env[name]) environment[name] = process.env[name]!;
  environment.PATH = coworkHostPath(environment.PATH ?? "", [binding.root]);
  // Stable per-worktree identity lets setup refresh an upgrade without accumulating duplicate projects.
  const identity = createHash("sha256").update(context.locator).digest("hex").slice(0, 32);
  const project_id = `${identity.slice(0,8)}-${identity.slice(8,12)}-${identity.slice(12,16)}-${identity.slice(16,20)}-${identity.slice(20)}`;
  const registration: CoworkRegistration = { version: 1, project_id, label, workspace: binding.root, locator: context.locator,
    node, coordinator, registry: binding.registry, directory: binding.directory, revision: binding.revision,
    runtime_version: installed.runtimeVersion, lock_digest: String(installed.lockDigest), tree_digest: installed.installedTree.digest,
    environment };
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error("cowork-registration-directory-alias");
  chmodSync(directory, 0o700);
  const temporary = join(directory, `.${project_id}.${randomUUID()}.tmp`), destination = join(directory, `${project_id}.json`);
  writeFileSync(temporary, JSON.stringify(registration, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, destination);
  return { ok: true, project_id, label, runtime_version: installed.runtimeVersion,
    registration: destination, disclosure: "Registered checks and hooks execute project code on this Mac. Returned text enters the connected host. No runtime pin changed." };
}
