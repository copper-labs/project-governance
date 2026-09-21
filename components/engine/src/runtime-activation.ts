import { resolve } from "node:path";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { digest, object } from "./core.ts";
import type { BackupInput } from "./runtime-backup.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";

/** Activate only against a verified backup from this still-owned maintenance interval. */
export function activateBackedRuntime(registry: string, candidate: string, backupDirectory: string,
  expectedInputs: BackupInput[], token: string, owner: string) {
  const backup = inspectRuntimeBackup(backupDirectory), generations = new RuntimeGenerations(registry);
  try {
    const verified = inspectRuntimeGeneration(candidate);
    const state = generations.state();
    if (state.maintenance?.token !== token || state.maintenance.owner !== owner ||
        backup.maintenance.token !== token || backup.maintenance.owner !== owner ||
        state.readers.length) {
      throw new Error("Backup does not bind the drained current maintenance interval");
    }
    const expected = expectedInputs.map(input => ({ path: resolve(input.path), kind: input.kind })).sort((a, b) => a.path.localeCompare(b.path));
    const actual = backup.records.map(raw => { const record = object(raw); return { path: record.source, kind: record.kind }; })
      .sort((a, b) => String(a.path).localeCompare(String(b.path)));
    if (digest(expected) !== digest(actual)) throw new Error("Backup scope differs from migration inputs");
    const operation = digest({ backup: backup.receiptDigest, candidate: verified.directory, lock: verified.lockDigest,
      tree: verified.installedTree, inputs: expected, token, owner });
    const committed = generations.activation(operation);
    if (committed) {
      if (committed.revision !== state.revision || committed.directory !== state.directory) throw new Error("Activation history no longer matches current generation");
      return { state, backupDigest: backup.receiptDigest, admission: "maintenance-retained-for-readback" };
    }
    if (backup.revision !== state.revision || backup.generation !== state.directory) throw new Error("Backup does not bind the drained current maintenance interval");
    return { state: generations.activate(verified.directory, state.revision, token, operation), backupDigest: backup.receiptDigest,
      admission: "maintenance-retained-for-readback" };
  } finally { generations.close(); }
}
