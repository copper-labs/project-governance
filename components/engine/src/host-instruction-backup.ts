import { lstatSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import { planHostInstructions } from "./host-instruction-plan.ts";
import type { BackupInput } from "./runtime-backup.ts";

/** Include existing, inactive and absent host targets in the caller's coherent migration backup. */
export function hostInstructionBackupScope(workspace: string, block: string) {
  const plan = planHostInstructions(workspace, block);
  const inputs: BackupInput[] = [...new Set(plan.entries.map(entry => entry.target))].map(target => {
    const path = join(plan.workspace, target);
    try { lstatSync(path); return { path, kind: "file" }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return { path, kind: "absent" }; }
  });
  return { plan, planDigest: digest(plan), inputs };
}
