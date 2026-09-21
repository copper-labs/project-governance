import { lstatSync, mkdirSync, opendirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkRunRoot } from "./check-run.ts";
import { digest, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand } from "./process-owner.ts";

function workspaceRoot(workspace: string) {
  return join(dirname(checkRunRoot()), "provider-jobs", digest(realpathSync(workspace)).slice(7));
}
/** The stable private directory is the submission reservation; there is no second job-state database. */
export function managedProviderDirectory(workspace: string, id: string) {
  text(id, "provider job id", 256);
  const parent = workspaceRoot(workspace);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (lstatSync(parent).isSymbolicLink()) throw new Error("Provider job store cannot be a symlink");
  return join(realpathSync(parent), digest(id).slice(7));
}

/** Bound both scan and output; listing never dispatches, reconciles or reads prompts into its result. */
export function listProviderJobs(workspace: string, limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Provider list limit must be 1..1000");
  workspace = realpathSync(workspace);
  const root = workspaceRoot(workspace);
  const jobs: Array<{ id: string; directory: string; requestDigest: string; state: string; cleanup: string | null }> = [];
  let entries: ReturnType<typeof opendirSync>;
  try {
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("Invalid provider job store");
    entries = opendirSync(root);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { jobs, inspected: 0, invalid: 0, truncated: false, scope: "managed-workspace-jobs" }; throw error; }
  let inspected = 0, invalid = 0, truncated = false, readBytes = 0;
  try {
    for (let entry = entries.readSync(); entry; entry = entries.readSync()) {
      if (inspected >= limit) { truncated = true; break; }
      inspected++;
      try {
        if (!/^[a-f0-9]{64}$/u.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Invalid job entry");
        const directory = join(realpathSync(root), entry.name);
        const raw = narrativeFile(directory, "request.json");
        readBytes += Buffer.byteLength(raw);
        if (readBytes > 16 * 1024 * 1024) { truncated = true; break; }
        const request = object(JSON.parse(raw)), operation = object(request.operation);
        const id = text(request.id, "provider job id", 256);
        if (request.version !== 1 || !request.provider || !request.assignment || request.runtime === undefined ||
            operation.cwd !== workspace || digest(id).slice(7) !== entry.name) throw new Error("Provider store request identity differs");
        const requestDigest = digest(request), observed = observeCommand(directory, requestDigest);
        jobs.push({ id, directory, requestDigest, state: observed.receipt?.state ?? observed.state, cleanup: observed.receipt?.cleanup ?? null });
      } catch { invalid++; }
    }
  } finally { entries.closeSync(); }
  return { jobs, inspected, invalid, truncated, scope: "managed-workspace-jobs" };
}
