import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, durableJson, durableText, fileDigest, object } from "./core.ts";

/** Replace only the owned product lock, retaining maintenance across write and readback. */
export function updateActivatedRuntimeLock(registry: string, workspace: string, backupDirectory: string, token: string, owner: string,lockText?:string) {
  workspace = realpathSync(workspace);
  const path = join(workspace, "config/governance/runtime.lock.yaml");
  const entry = lstatSync(path,{throwIfNoEntry:false});
  if (realpathSync(dirname(path)) !== dirname(path) ||
      (entry && (!entry.isFile() || realpathSync(path) !== path)))
    throw new Error("Product lock cannot use symlinks");
  const backup = inspectRuntimeBackup(backupDirectory), generations = new RuntimeGenerations(registry);
  try {
    const state = generations.state();
    if (!state.directory || state.readers.length || state.maintenance?.token !== token || state.maintenance.owner !== owner ||
        backup.maintenance.token !== token || backup.maintenance.owner !== owner || state.revision !== backup.revision + 1 ||
        state.previous !== backup.generation || state.written) throw new Error("Lock update requires a backed pre-write activation under maintenance");
    const installed = inspectRuntimeGeneration(state.directory);
    const installation = object(JSON.parse(narrativeFile(state.directory, "installation.json")));
    const lock = compiledRuntimeLock(installation.lock);
    if (digest(lock) !== installed.lockDigest) throw new Error("Candidate lock identity changed");
    if(lockText!==undefined && (Buffer.byteLength(lockText)>1024*1024 || digest(compiledRuntimeLock(parse(lockText)))!==installed.lockDigest))
      throw new Error("Exact lock text differs from installed candidate");
    const record = backup.records.map(raw => object(raw)).find(record => record.source === path && ["file","absent"].includes(String(record.kind)));
    if (!record) throw new Error("Product lock missing from backup scope");
    if(record.kind === "absent" && backup.generation !== null) throw new Error("Missing lock is only valid for first installation");
    const currentText = existsSync(path) ? narrativeFile(workspace, "config/governance/runtime.lock.yaml") : null;
    const current=currentText===null?null:parse(currentText);
    const alreadyUpdated = lockText===undefined?digest(current)===digest(lock):currentText===lockText;
    if (!alreadyUpdated && (record.kind === "absent" ? existsSync(path) : !existsSync(path) || fileDigest(path) !== record.digest)) throw new Error("Authored product lock changed since backup");
    if (!alreadyUpdated) {
      if(lockText===undefined)durableJson(path, lock); // JSON is valid YAML; this file is runtime-owned.
      else durableText(path,lockText);
    }
    const readback = compiledRuntimeLock(parse(narrativeFile(workspace, "config/governance/runtime.lock.yaml")));
    if (digest(readback) !== installed.lockDigest) throw new Error("Product lock readback failed");
    if(lockText!==undefined && narrativeFile(workspace,path)!==lockText)throw new Error("Exact product lock readback failed");
    return { state: "lock-verified", lockDigest: installed.lockDigest, revision: state.revision,
      changed: !alreadyUpdated, admission: "maintenance-retained-for-launcher-readback" };
  } finally { generations.close(); }
}
