import { closeSync, fchmodSync, fsyncSync, lstatSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "./core.ts";
import { planHostInstructions } from "./host-instruction-plan.ts";

/** Apply only the owned block after group preflight; interrupted runs retain valid earlier changes for replay. */
export function installHostInstructions(workspace: string, block: string, options: { expectedPlanDigest?: string; dryRun?: boolean } = {}) {
  const plan = planHostInstructions(workspace, block), planDigest = digest(plan);
  if (options.expectedPlanDigest !== undefined && options.expectedPlanDigest !== planDigest) throw new Error("Host instruction plan changed before installation");
  // Atomic replacement cannot preserve external hard-link relationships. Refuse rather than sever them.
  for (const write of plan.writes) if (write.beforeDigest !== null && lstatSync(join(plan.workspace, write.path)).nlink !== 1) throw new Error("Host instruction target has hard links; reconcile authored ownership first");
  if (options.dryRun) return { state: "planned", planDigest, changed: [], plan };
  const changed: string[] = [];
  const unchanged = (index: number) => {
    const current = planHostInstructions(plan.workspace, block);
    if (digest(current.entries) !== digest(plan.entries) || digest(current.writes) !== digest(plan.writes.slice(index))) throw new Error("Host instructions changed during installation; earlier changes retained");
  };
  for (const [index, write] of plan.writes.entries()) {
    unchanged(index);
    const path = join(plan.workspace, write.path), temporary = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", write.mode);
    try {
      try { writeFileSync(fd, write.content); fchmodSync(fd, write.mode); fsyncSync(fd); } finally { closeSync(fd); }
      unchanged(index);
      if (write.beforeDigest !== null && lstatSync(path).nlink !== 1) throw new Error("Host instruction target acquired a hard link during installation");
      renameSync(temporary, path);
      const parent = openSync(dirname(path), "r");
      try { fsyncSync(parent); } finally { closeSync(parent); }
      changed.push(write.path);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  unchanged(plan.writes.length);
  return { state: changed.length ? "installed" : "unchanged", planDigest, changed, plan };
}
