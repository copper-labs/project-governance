import { checkObservationContext, type CheckObservationContext } from "./check-observation-context.ts";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, existsSync, openSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { digest, durableJson, fileDigest } from "./core.ts";
import { commandEnvironment } from "./process-owner.ts";
import { checkRunRoot, runChecks } from "./check-run.ts";
import { ValidationSubject, type ChangeScope } from "./change-subject.ts";
import { PackagedCheckerAssets } from "./checker-assets.ts";
import type { Packs } from "./pack-configuration.ts";
import type { ValidationPlan } from "./planning.ts";
import type { BuiltinCheckRequest } from "./builtin-checks.ts";
import { retainRuntimeReader, releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import type { DecisionTaskContext } from "./decision-task-context.ts";
import type { TaskBindingReceipt } from "./decision-task-binding.ts";
const WORKER = fileURLToPath(import.meta.url);
interface CheckWork extends CheckObservationContext {
  version: 1; trigger?: "manual" | "hook" | "test"; id: string; root: string; runsRoot: string; assetsRoot: string; workerDigest: string;
  packs: Packs; plan: ValidationPlan; scope: ChangeScope; stage: string; asOf: string; deadlineMs: number; deadlineAt: number;
  narrative: Pick<BuiltinCheckRequest, "commit" | "pullRequest">; managedPaths: string[]; runFixtureProof: boolean; workId: string;
  generation: RuntimeReader | null;
  decisionContext?: DecisionTaskContext;
  taskBinding?: TaskBindingReceipt;
}
/** Reserve a single detached owner before launching. Reconnection only observes the returned run ID. */
export function dispatchChecks(packs: Packs, plan: ValidationPlan, request: Omit<BuiltinCheckRequest, "id" | "assets"> & { assets: PackagedCheckerAssets }, options: { root?: string; deadlineMs?: number; decisionContext?: DecisionTaskContext; taskBinding?: TaskBindingReceipt } & CheckObservationContext = {}) {
  const observation = checkObservationContext(options.trigger, options.expectedStatus);
  const root = options.root ?? checkRunRoot(); mkdirSync(root, { recursive: true, mode: 0o700 });
  const runsRoot = realpathSync(root), id = randomUUID(), directory = join(runsRoot, id); mkdirSync(directory, { mode: 0o700 });
  const work: CheckWork = { version: 1, ...observation, id, root: request.subject.root, runsRoot, assetsRoot: request.assets.root, workerDigest: fileDigest(WORKER),
    generation: retainRuntimeReader(`check:${id}`, { workspace: request.subject.root, stage: request.stage }),
    ...(options.decisionContext ? { decisionContext: options.decisionContext } : {}),
    ...(options.taskBinding ? { taskBinding: options.taskBinding } : {}),
    deadlineAt: Date.now() + (options.deadlineMs ?? 300000),
    packs, plan, scope: request.scope, stage: request.stage, asOf: request.asOf, deadlineMs: options.deadlineMs ?? 300000,
    managedPaths: [...(request.managedPaths ?? [])], runFixtureProof: request.runFixtureProof ?? false, workId: request.workId ?? "",
    narrative: { ...(request.commit ? { commit: request.commit } : {}), ...(request.pullRequest ? { pullRequest: request.pullRequest } : {}) } };
  durableJson(join(directory, "dispatch.json"), work);
  durableJson(join(directory, "run.json"), { version: 1, id, root: work.root, state: "queued", ...(work.trigger ? { trigger: work.trigger } : {}), ...(work.expectedStatus ? { expected_status: work.expectedStatus } : {}), started_at: new Date().toISOString(), plan, scope: work.scope, owner: null });
  const child = spawn(process.execPath, [WORKER, "--worker", directory, digest(work)], { detached: true, stdio: "ignore", env: commandEnvironment({}) });
  child.on("error", () => { /* Reservation remains unresolved; never launch a replacement on missing acknowledgment. */ });
  child.unref();
  return { run_id: id, run_directory: directory };
}
async function worker(directory: string, expectedDigest: string) {
  const work = JSON.parse(readFileSync(join(directory, "dispatch.json"), "utf8")) as CheckWork;
  if (work.version !== 1 || digest(work) !== expectedDigest || work.workerDigest !== fileDigest(WORKER) || resolve(directory) !== join(work.runsRoot, work.id)) throw new Error("Invalid check worker binding");
  // An exclusive claim prevents even a duplicate worker invocation from repeating a pack sequence.
  const claim = openSync(join(directory, "worker.claim"), "wx", 0o600); closeSync(claim);
  try {
    const result = await runChecks(work.packs, work.plan, { subject: new ValidationSubject(work.root, work.scope), scope: work.scope,
      assets: new PackagedCheckerAssets(work.assetsRoot), packIds: new Set(Object.keys(work.packs)), stage: work.stage, asOf: work.asOf, workId: work.workId, managedPaths: new Set(work.managedPaths), runFixtureProof: work.runFixtureProof, ...work.narrative },
    { root: work.runsRoot, deadlineMs: work.deadlineMs, deadlineAt: work.deadlineAt, reservedRunId: work.id, ...checkObservationContext(work.trigger, work.expectedStatus) });
    // Native check completion resolves its generation obligation; exceptions retain it for reconciliation.
    const unresolved = result.results.some(pack => pack.commands.some(command => command.termination_reason === "cleanup-unknown" || command.termination_reason === "outcome-unknown"));
    if (!unresolved) releaseRuntimeReader(work.generation);
  } catch {
    durableJson(join(directory, "failure.json"), { version: 1, id: work.id, reason: "worker-incomplete", ended_at: new Date().toISOString() });
    process.exitCode = 2;
  }
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(WORKER) && process.argv[2] === "--worker") {
  await worker(process.argv[3]!, process.argv[4]!).catch(() => { process.exitCode = 2; });
}
