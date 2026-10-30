import { realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses } from "./command-owner-recovery.ts";
import { processFingerprint } from "./process-owner.ts";
import { releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import type { WorkflowRun } from "./workflow-store.ts";

/** Parse only the complete calendar-valid start format saved by this worker generation. */
export function startTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) +(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +(\d{1,2}) +(\d{2}):(\d{2}):(\d{2}) +(\d{4})$/u.exec(value);
  if (!parts) return null;
  const month = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ").indexOf(parts[2]!);
  const fields = [Number(parts[7]), month, Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6])];
  const date = new Date(Date.UTC(fields[0]!, month, fields[2]!, fields[3]!, fields[4]!, fields[5]!));
  const observed = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  return fields.some((field, index) => field !== observed[index]) || "Sun Mon Tue Wed Thu Fri Sat".split(" ")[date.getUTCDay()] !== parts[1]
    ? null : date.getTime();
}

function requireAbsentWorker(pid: number, fingerprint: unknown, acknowledgedAt: number): void {
  if (!commandProcesses().some(process => process.pid === pid)) return;
  const saved = startTime(fingerprint), current = startTime(processFingerprint(pid));
  if (process.platform !== "darwin" || saved === null || current === null || saved === current)
    throw new Error("Workflow worker still present or identity unavailable");
  // Legacy lstart has no timezone. A replacement must also postdate the original acknowledgement;
  // changing a display setting alone cannot prove the original worker has gone.
  const utc = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8", timeout: 2000, maxBuffer: 16384, env: { ...process.env, LC_ALL: "C", TZ: "UTC0" },
  }).trim();
  const startedAt = startTime(utc);
  if (startedAt === null || !Number.isFinite(acknowledgedAt) || startedAt <= acknowledgedAt || startedAt > Date.now())
    throw new Error("Workflow worker absence is not proven by its start identity");
}

/** Shared original identity checks do not themselves release or change a workflow. */
export function workflowRecoveryIdentity(directory: string, database: string, run: WorkflowRun) {
  directory=realpathSync(directory);
  const request=JSON.parse(narrativeFile(directory,join(directory,"request.json")));
  const ownerPath=join(directory,"owner.json"), acknowledgedAt=statSync(ownerPath).mtimeMs;
  const owner=JSON.parse(narrativeFile(directory,ownerPath));
  if(request.version!==1 || request.runId!==run.id || realpathSync(request.database)!==realpathSync(database) ||
      request.bindingDigest!==digest(run.binding) || owner.requestDigest!==digest(request) ||
      !Number.isSafeInteger(owner.pid) || owner.pid<1) throw new Error("Workflow reader recovery binding differs");
  const reader=request.generation as RuntimeReader | null | undefined;
  if(reader && (reader.owner!==`workflow:${run.id}` || typeof reader.registry!=="string" ||
      typeof reader.token!=="string" || !Number.isSafeInteger(reader.revision) || typeof reader.directory!=="string"))
    throw new Error("Workflow generation reader binding differs");
  return { request, reader: reader ?? null,
    assertAbsent: () => requireAbsentWorker(owner.pid,owner.fingerprint,acknowledgedAt),
    assertUnchanged: () => {
      if (statSync(ownerPath).mtimeMs !== acknowledgedAt || digest(JSON.parse(narrativeFile(directory,ownerPath))) !== digest(owner) ||
          digest(JSON.parse(narrativeFile(directory,join(directory,"request.json")))) !== digest(request))
        throw new Error("Workflow reader recovery evidence changed");
    } };
}

/** Retire a detached reader only after terminal reconciliation and confirmed worker absence. */
export function releaseRecoveredWorkflowReader(directory: string, database: string, run: WorkflowRun) {
  if (!["succeeded", "failed", "cancelled", "blocked"].includes(run.state)) throw new Error("Workflow is not terminal");
  const identity = workflowRecoveryIdentity(directory,database,run);
  identity.assertAbsent(); identity.assertUnchanged();
  releaseRuntimeReader(identity.reader,true);
  return {state:identity.reader?"released":"not-retained"};
}
