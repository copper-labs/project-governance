import { join } from "node:path";
import { lstatSync, readFileSync } from "node:fs";
import { digest, object } from "./core.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { planHostInstructions } from "./host-instruction-plan.ts";
import { mergeHostInstructions } from "./host-instruction-merge.ts";
import { narrativeFile } from "./narrative-inputs.ts";

/** Verify both original and already-applied targets for interruption-safe migration, never infer ownership from a marker alone. */
export function verifyHostInstructionBackup(plan: ReturnType<typeof planHostInstructions>, block: string, backupDirectory: string) {
  const backup = inspectRuntimeBackup(backupDirectory);
  const current = planHostInstructions(plan.workspace, block);
  if (current.workspace !== plan.workspace || digest(current.entries) !== digest(plan.entries)) throw new Error("Host instruction entry mapping changed since backup planning");
  const records = backup.records.map(raw => object(raw));
  const targets = [...new Set(plan.entries.map(entry => entry.target))];
  for (const target of targets) {
    const source = join(plan.workspace, target), record = records.find(record => record.source === source);
    if (!record || !["file", "absent"].includes(String(record.kind))) throw new Error("Host instruction target missing from backup scope");
    const original = record.kind === "absent" ? "" : new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(join(backup.directory, String(record.file))));
    const active = plan.entries.some(entry => entry.target === target && entry.active);
    const intended = active ? mergeHostInstructions(original, block) : original;
    const planned = plan.writes.find(write => write.path === target);
    if (original !== intended) {
      if (!planned || planned.content !== intended || planned.beforeDigest !== (record.kind === "absent" ? null : digest(original)) || planned.mode !== (record.kind === "absent" ? 0o644 : record.mode)) throw new Error("Host instruction plan differs from backed content");
    } else if (planned) throw new Error("Host instruction plan changes unowned content");
    let stat;
    try { stat = lstatSync(source); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && record.kind === "absent") continue;
      throw error;
    }
    const actual = narrativeFile(plan.workspace, target);
    if (!stat.isFile() || stat.isSymbolicLink() || (record.kind === "absent" ? actual !== intended : actual !== original && actual !== intended) ||
        (stat.mode & 0o777) !== (record.kind === "absent" ? 0o644 : record.mode)) throw new Error("Host instruction content changed outside the backed transition");
  }
  if (plan.writes.some(write => !targets.includes(write.path))) throw new Error("Host instruction plan contains an unbound target");
  return { backupDigest: backup.receiptDigest, planDigest: digest(plan), remainingPlanDigest: digest(current), complete: current.writes.length === 0 };
}
