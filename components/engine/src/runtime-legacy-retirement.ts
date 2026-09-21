import { lstatSync, realpathSync, unlinkSync, openSync, fsyncSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { fileDigest, object } from "./core.ts";

// Exact shipped identities avoid treating an authored script at the same path as disposable.
const legacyFiles: Record<string, string | null> = {
  ".governance/runtime/bin/harness-agent": null,
  "tools/governance-bootstrap.py": "sha256:63c4b02c91c8cbe72b562440df493b264fbbd2c789a6d82b2d58cdbef42339ee",
  "tools/governance-startup.py": "sha256:48308b51ca0da54560f2b78d205f2222dcc536d4a7eb52f2cbe7ef83f4eecacd",
};
export function legacyRuntimeEntrypoints(workspace: string) {
  return Object.entries(legacyFiles).map(([name, expectedDigest]) => ({path: join(workspace, name), expectedDigest}));
}
function present(path: string) {
  try { lstatSync(path); return true; }
  catch(error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export function hasLegacyRuntimeEntrypoints(workspace: string) {
  return legacyRuntimeEntrypoints(workspace).some(({path}) => present(path));
}

/** Retire backed wheel launchers before admission; pre-write recovery restores their original bytes. */
export function retireLegacyRuntimeEntrypoints(registry:string,workspace:string,backupDirectory:string,token:string,owner:string) {
  workspace=realpathSync(workspace);
  const backup=inspectRuntimeBackup(backupDirectory);
  if (backup.generation !== null) return;
  const generations=new RuntimeGenerations(registry);
  try {
    const state=generations.state();
    if (!state.directory || state.written || state.readers.length || state.maintenance?.token!==token || state.maintenance.owner!==owner ||
        backup.maintenance.token!==token || backup.maintenance.owner!==owner || state.revision!==backup.revision+1 || state.previous!==null)
      throw new Error("Legacy retirement requires backed pre-write activation");
    const paths = legacyRuntimeEntrypoints(workspace).filter(({path}) => present(path));
    // Validate the complete set before deleting any member; interrupted deletion can safely resume.
    for (const {path, expectedDigest} of paths) {
      const record=backup.records.map(raw=>object(raw)).find(record=>record.source===path && record.kind==="file");
      if (!record) throw new Error("Legacy entrypoint missing from backup scope");
      if (expectedDigest && record.digest!==expectedDigest) throw new Error("Customized legacy script requires deliberate reconciliation");
      if (realpathSync(path)!==path || !lstatSync(path).isFile() || fileDigest(path)!==record.digest || (lstatSync(path).mode & 0o777)!==record.mode)
        throw new Error("Legacy entrypoint changed since backup");
    }
    for (const {path} of paths) {
      unlinkSync(path);
      const fd=openSync(dirname(path),"r");try {fsyncSync(fd);}finally {closeSync(fd);}
    }
  } finally {generations.close();}
}
