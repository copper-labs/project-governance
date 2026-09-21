import { RELEASE_VERSION } from "./release-version.ts";
import { checkObservationContext, type CheckObservationContext } from "./check-observation-context.ts";
import { projectRunMetric } from "./telemetry-projection.ts";
import type { RunMetric } from "./check-telemetry.ts";
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { digest, durableJson, fileDigest } from "./core.ts";
import { materializeChangePacket } from "./change-packet.ts";
import { resolveCommandArgv } from "./command-argv.ts";
import { runNativeCheckCommand } from "./native-check-command.ts";
import { checkCancellationRequested } from "./check-cancellation.ts";
import { processFingerprint } from "./process-owner.ts";
import { inspectEvidenceManifest } from "./evidence-manifest.ts";
import { executeChecks } from "./check-execution.ts";
import type { BuiltinCheckRequest } from "./builtin-checks.ts";
import type { Packs } from "./pack-configuration.ts";
import type { ValidationPlan } from "./planning.ts";

/** Keep check evidence outside the source tree so subsequent scans cannot select their own output. */
export function checkRunRoot(): string {
  const state = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state");
  if (!isAbsolute(state)) throw new Error("XDG_STATE_HOME must be absolute");
  return join(state, "project-governance", "check-runs");
}
/** Persist intent before dispatch and terminal evidence afterwards; interruption leaves an explicitly unfinished run. */
export async function runChecks(packs: Packs, plan: ValidationPlan, request: Omit<BuiltinCheckRequest, "id">, options: { root?: string; deadlineMs?: number; deadlineAt?: number; reservedRunId?: string; } & CheckObservationContext = {}) {
  checkObservationContext(options.trigger, options.expectedStatus);
  const parent = options.root ?? checkRunRoot(); mkdirSync(parent, { recursive: true, mode: 0o700 });
  const id = options.reservedRunId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/u.test(id)) throw new Error("Invalid reserved check identity");
  const directory = join(realpathSync(parent), id);
  if (!options.reservedRunId) mkdirSync(directory, { mode: 0o700 });
  const startedAt = new Date().toISOString(), deadlineMs = options.deadlineMs ?? 300_000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 86_400_000) throw new Error("Invalid check timeout");
  const deadline = options.deadlineAt ?? Date.now() + deadlineMs;
  if (!Number.isSafeInteger(deadline) || deadline <= 0) throw new Error("Invalid check deadline");
  durableJson(join(directory, "run.json"), { version: 1, id, root: request.subject.root, started_at: startedAt, ...(options.trigger ? { trigger: options.trigger } : {}), ...(options.expectedStatus ? { expected_status: options.expectedStatus } : {}), state: "running", owner: { pid: process.pid, fingerprint: processFingerprint(process.pid) }, plan, scope: request.scope, packs_digest: digest(JSON.parse(JSON.stringify(packs))) });
  try {
    const packet = materializeChangePacket(request.subject.root, request.scope, join(directory, "packet"));
    const cancelled = () => checkCancellationRequested(directory, id);
    const result = await executeChecks(packs, plan, request, undefined, async (entry, packId, index) => {
      const packDirectory = join(directory, digest(packId).slice(7)); mkdirSync(packDirectory, { recursive: true, mode: 0o700 });
      const evidence = join(packDirectory, "evidence"); mkdirSync(evidence, { recursive: true, mode: 0o700 });
      const argv = resolveCommandArgv(entry, { stage: request.stage,
        ...(request.commit ? { commit_message_file: request.commit.path } : {}),
        ...(request.pullRequest ? { pr_body_file: request.pullRequest.path, pr_title: request.pullRequest.title } : {}) });
      return runNativeCheckCommand({ directory: join(packDirectory, `command-${index}`), id: `${id}:${packId}:${index}`, root: request.subject.root,
        argv, deadlineMs: Math.max(1, Math.min(deadlineMs, deadline - Date.now())), cancelled, env: { ...packet.env, PROJECT_GOVERNANCE_RUN_ID: id, PROJECT_GOVERNANCE_EVIDENCE_ROOT: evidence } });
    }, packId => inspectEvidenceManifest(join(directory, digest(packId).slice(7), "evidence"), request.scope.subject_digest, request.assets.schema("evidence-manifest")), cancelled, () => Date.now() >= deadline);
    const receipt = { version: 1, kind: "project-governance-check-run", ...result, duration_ms: Date.now() - Date.parse(startedAt), run_id: id, run_directory: directory, started_at: startedAt, ended_at: new Date().toISOString() };
    durableJson(join(directory, "result.json"), receipt);
    try { const metric: RunMetric = { version: 1, ...(options.trigger ? { trigger: options.trigger } : {}), ...(options.expectedStatus ? { expected_status: options.expectedStatus } : {}), run_id: id, workspace: request.subject.root, stage: plan.stage, runtime_version: RELEASE_VERSION,
      status: receipt.status, termination_reason: receipt.termination_reason ?? "completed", duration_ms: receipt.duration_ms, started_at: startedAt, ended_at: receipt.ended_at,
      pack_count: receipt.results.length, command_count: receipt.results.reduce((sum, pack) => sum + pack.commands.length, 0), blocked_pack_count: Object.keys(receipt.blocked).length,
      result_digest: fileDigest(join(directory, "result.json")) };
      durableJson(join(directory, "metrics.json"), metric);
      projectRunMetric(parent, metric); }
    catch { /* Terminal execution evidence remains authoritative; telemetry reports the missing projection. */ }
    return receipt;
  } catch {
    durableJson(join(directory, "failure.json"), { version: 1, id, status: "failed", reason: "check-orchestration-incomplete", ended_at: new Date().toISOString() });
    throw new Error(`Check execution incomplete; evidence retained at ${directory}`);
  }
}
