import { DatabaseSync } from "node:sqlite";
import { lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { digest } from "./core.ts";
import { planGitHookInstallation } from "./git-hook-installation.ts";
import { planHostInstructions } from "./host-instruction-plan.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";

/** Observe without creating, migrating or taking a generation reader; usable during interrupted activation. */
export function runtimeDoctor(workspace: string, registry: string) {
  workspace = realpathSync(workspace); registry = resolve(registry);
  const findings: Array<{ id: string; message: string }> = [];
  const add = (id: string, message: string) => findings.push({ id, message });
  let database: DatabaseSync | undefined;
  let selection: { revision: number; directory: string | null; written: boolean; readerCount: number; maintenance: boolean } | null = null;
  let lockDigest: string | null = null;
  try {
    const path = join(workspace, "config/governance/runtime.lock.yaml");
    if (realpathSync(path) !== path) throw new Error("Aliased lock");
    lockDigest = digest(compiledRuntimeLock(parse(narrativeFile(workspace, path))));
  } catch { add("installation.lock-invalid", "The project needs a valid compiled runtime lock at config/governance/runtime.lock.yaml."); }
  try {
    const stat = lstatSync(registry);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(registry) !== registry) throw new Error("Invalid registry path");
    database = new DatabaseSync(registry, { readOnly: true });
    database.exec("PRAGMA busy_timeout=1000; BEGIN");
    if (database.prepare("PRAGMA user_version").get()?.user_version !== 7) throw new Error("Unsupported installation protocol");
    const current = database.prepare("SELECT revision,directory,written FROM current WHERE id=1").get();
    if (!current || !Number.isSafeInteger(current.revision) || Number(current.revision) < 0 || ![0, 1].includes(Number(current.written)) ||
        (current.directory !== null && typeof current.directory !== "string")) throw new Error("Invalid installation selection");
    const maintenance = Boolean(database.prepare("SELECT id FROM maintenance WHERE id=1").get());
    const readerCount = Number(database.prepare("SELECT count(*) AS count FROM readers").get()!.count);
    selection = { revision: Number(current.revision), directory: current.directory as string | null, written: current.written === 1, readerCount, maintenance };
    database.exec("COMMIT");
  } catch { add("installation.registry-unavailable", "The installation registry is missing, unreadable or uses an unsupported protocol; no migration was attempted."); }
  finally { database?.close(); }
  if (selection) {
    if (selection.maintenance) add("installation.maintenance", "Runtime admission is stopped for maintenance; resume the recorded transition or recovery.");
    if (!selection.directory) add("installation.no-generation", "No compiled runtime generation is selected.");
    else {
      try {
        const installed = inspectRuntimeGeneration(selection.directory);
        if (installed.lockDigest !== lockDigest) add("installation.lock-mismatch", "The selected generation and project lock differ.");
        const path = join(workspace, ".governance/runtime/bin/project-governance"), stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || !(stat.mode & 0o100) ||
            narrativeFile(workspace, path) !== runtimeLauncher(realpathSync(process.execPath), String(installed.executable), registry, workspace)) {
          add("installation.launcher-mismatch", "The installed launcher does not match the selected generation or is not executable.");
        }
      } catch { add("installation.payload-unavailable", "The selected runtime payload or launcher could not be verified; no code was executed."); }
    }
  }
  try {
    const hooks = planGitHookInstallation(workspace);
    if (hooks.hooksPath !== ".githooks") add("installation.hooks-unconfigured", "Git does not select the managed .githooks directory.");
    if (!hooks.ready || hooks.hooks.some(hook => hook.action !== "current")) add("installation.hooks-drift", "Managed hooks are missing or changed; inspect hooks before reconciling authored content.");
  } catch { add("installation.hooks-unavailable", "Hook configuration could not be inspected safely."); }
  try {
    const instructions = planHostInstructions(workspace, COMPILED_HOST_BLOCK);
    if (instructions.writes.length) add("installation.host-instructions-drift", "Managed agent instructions are missing or differ from this runtime; run host-instructions --dry-run, then apply the reviewed --plan-digest.");
  } catch { add("installation.host-instructions-unavailable", "Managed agent instructions could not be inspected safely; reconcile their ownership and markers."); }
  return { version: 1, scope: "compiled-installation", status: findings.length ? "failed" : "passed", selection, findings,
    execution_readback: "not-performed", active_readers: "reported-without-releasing", mutations: "none" };
}
