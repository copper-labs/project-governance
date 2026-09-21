import { existsSync, lstatSync, realpathSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { fileDigest, object } from "./core.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export function runtimeLauncher(node: string, executable: string, registry: string, workspace: string): string {
  if ([node, executable, registry, workspace].some(value => value.includes("\0") || value.includes("\n"))) throw new Error("Invalid launcher path");
  return `#!/bin/sh\nexec ${quote(node)} ${quote(executable)} runtime-run --registry ${quote(registry)} --workspace ${quote(workspace)} -- "$@"\n`;
}

/** Replace the backed-up entry point only; authored changes require reconciliation rather than overwrite. */
export function installActivatedLauncher(registry: string, workspace: string, backupDirectory: string, token: string, owner: string) {
  workspace = realpathSync(workspace); registry = realpathSync(registry);
  const path = join(workspace, ".governance/runtime/bin/project-governance");
  const entry = lstatSync(path,{throwIfNoEntry:false});
  if (realpathSync(dirname(path)) !== dirname(path) ||
      (entry && (!entry.isFile() || realpathSync(path) !== path))) throw new Error("Launcher cannot use a symlink");
  const generations = new RuntimeGenerations(registry), backup = inspectRuntimeBackup(backupDirectory);
  try {
    const state = generations.state();
    if (!state.directory || state.readers.length || state.written || state.maintenance?.token !== token || state.maintenance.owner !== owner ||
        backup.maintenance.token !== token || backup.maintenance.owner !== owner || state.revision !== backup.revision + 1 || state.previous !== backup.generation) throw new Error("Launcher update requires backed activation under maintenance");
    const installed = inspectRuntimeGeneration(state.directory);
    const content = runtimeLauncher(realpathSync(process.execPath), String(installed.executable), registry, workspace);
    const record = backup.records.map(raw => object(raw)).find(record => record.source === path && ["file","absent"].includes(String(record.kind)));
    if (!record) throw new Error("Launcher missing from backup scope");
    if(record.kind === "absent" && backup.generation !== null) throw new Error("Missing launcher is only valid for first installation");
    const alreadyUpdated = existsSync(path) && narrativeFile(workspace, path) === content;
    if (!alreadyUpdated && (record.kind === "absent" ? existsSync(path) : !existsSync(path) || fileDigest(path) !== record.digest)) throw new Error("Launcher changed since backup");
    if (!alreadyUpdated) {
      const temporary = `${path}.${randomUUID()}.tmp`, fd = openSync(temporary, "wx", 0o700);
      try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, path);
      const directory = openSync(dirname(path), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    }
    chmodSync(path, 0o700);
    if (narrativeFile(workspace, path) !== content) throw new Error("Launcher readback failed");
    return { path, digest: fileDigest(path), changed: !alreadyUpdated, admission: "maintenance-retained" };
  } finally { generations.close(); }
}
