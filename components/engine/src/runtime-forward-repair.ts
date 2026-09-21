import { requireLegacyHistory, type LegacyHistoryRequirement } from "./legacy-history-completion.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { backup, DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, lstatSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import type { BackupInput } from "./runtime-backup.ts";
import { prepareRuntimeTransition } from "./runtime-transition.ts";
import { finalizeRuntimeActivation } from "./runtime-finalization.ts";
import { digest, fileDigest, object } from "./core.ts";

/** Replace runtime files while proving declared post-write evidence stayed intact; never restore task databases. */
export async function forwardRepairRuntime(registry: string, workspace: string, candidate: string,
  backupDirectory: string, inputs: BackupInput[], token: string, owner: string, history?: LegacyHistoryRequirement) {
  if (history) requireLegacyHistory(registry,workspace,token,owner,history);
  workspace = realpathSync(workspace);
  const snapshot = inspectRuntimeBackup(backupDirectory);
  if (!snapshot.generation || snapshot.written !== true) throw new Error("Forward repair requires a current post-write compiled backup");
  const installationFiles = new Set([join(workspace, "config/governance/runtime.lock.yaml"), join(workspace, ".governance/runtime/bin/project-governance")]);
  const preserved = snapshot.records.map(raw => object(raw)).filter(record => !installationFiles.has(String(record.source)));
  if (!preserved.some(record => record.kind === "sqlite")) throw new Error("Forward repair must declare the current operational database");
  const preservedInputsDigest = digest(preserved);
  const generations = new RuntimeGenerations(registry);
  try { generations.requireRepair(token, owner, preservedInputsDigest); } finally { generations.close(); }
  const prepared = prepareRuntimeTransition(registry, workspace, candidate, backupDirectory, inputs, token, owner);
  if (!prepared.completed) {
    const temporary = mkdtempSync(join(tmpdir(), "runtime-repair-readback-"));
    const databases: DatabaseSync[] = [], rechecks: Array<() => void> = [];
    try {
      for (const [index, record] of preserved.entries()) {
        const source = String(record.source);
        if (record.kind === "absent") {
          const assertAbsent = () => {
            let parent=dirname(source);
            while(!lstatSync(parent,{throwIfNoEntry:false})) {
              const next=dirname(parent);
              if(next===parent)throw new Error("Forward repair absent parent missing");
              parent=next;
            }
            if (!lstatSync(parent).isDirectory() || realpathSync(parent) !== parent) throw new Error("Forward repair absent parent changed");
            try { lstatSync(source); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
            throw new Error("Forward repair absent input was created; maintenance retained");
          };
          assertAbsent(); rechecks.push(assertAbsent); continue;
        }
        const stat = lstatSync(source);
        if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(source) !== source || (stat.mode & 0o777) !== record.mode) throw new Error("Forward repair evidence identity changed; maintenance retained");
        rechecks.push(() => {
          const current = lstatSync(source);
          if (current.dev !== stat.dev || current.ino !== stat.ino || current.mode !== stat.mode || realpathSync(source) !== source) throw new Error("Forward repair evidence identity changed; maintenance retained");
        });
        let observed = source;
        if (record.kind === "sqlite") {
          const database = new DatabaseSync(source, { readOnly: true });
          databases.push(database);
          const before = digest(database.prepare("PRAGMA data_version").get());
          rechecks.push(() => { if (digest(database.prepare("PRAGMA data_version").get()) !== before) throw new Error("Forward repair database changed during readback; maintenance retained"); });
          observed = join(temporary, `${index}.sqlite`);
          await backup(database, observed);
        }
        if (record.kind === "file") rechecks.push(() => { if (fileDigest(source) !== record.digest) throw new Error("Forward repair evidence changed during readback; maintenance retained"); });
        if (fileDigest(observed) !== record.digest) throw new Error("Forward repair evidence changed; maintenance retained");
      }
      for (const recheck of rechecks) recheck();
    } finally { for (const database of databases) database.close(); rmSync(temporary, { recursive: true, force: true }); }
  }
  const finalized = finalizeRuntimeActivation(registry, workspace, token, owner, preservedInputsDigest, undefined, history);
  return { ...finalized, backupDigest: snapshot.receiptDigest, preservedInputsDigest, evidenceScope: "declared-inputs", restoration: "none" };
}
