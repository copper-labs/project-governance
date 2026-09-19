import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { Store } from "../store/store.ts";
import { contentAddress } from "../store/store.ts";
import type { Action, Evidence } from "../model/types.ts";
import { beginAction, completeAction, prepareAction } from "./actions.ts";

export interface CheckRequest {
  /** What claim running this is meant to test. */
  claim: string;
  command: string;
  args: string[];
  cwd: string;
  /** The exact source version this ran against, so evidence is attributable. */
  subject: string | null;
  timeoutMs?: number;
}

export interface CheckResult {
  action: Action;
  evidence: Evidence | null;
  receiptArtifactId: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Run a declared check and record what it establishes.
 *
 * The harness does not write to a working tree: this executes a command the operator
 * declared and keeps its receipt. What the receipt establishes is stated carefully — a
 * passing check establishes that those checks passed on that subject, and no more.
 */
export function runCheck(
  store: Store,
  action: Action,
  req: CheckRequest,
  opts: { costMicros?: number } = {},
): CheckResult {
  const prepared = prepareAction(
    store,
    action,
    [`receipt:${req.command}`],
    `re-run '${req.command} ${req.args.join(" ")}' in ${req.cwd} and compare its receipt`,
  );
  const running = beginAction(store, prepared);

  const started = performance.now();
  const proc = spawnSync(req.command, req.args, {
    cwd: req.cwd,
    encoding: "utf8",
    timeout: req.timeoutMs ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Math.round(performance.now() - started);
  const timedOut = proc.error !== undefined && /ETIMEDOUT|timeout/i.test(String(proc.error));

  const output = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  const receipt = store.putArtifact({
    kind: "receipt",
    subject: req.subject,
    path: null,
    inline: output.length > 64_000 ? output.slice(0, 64_000) + "\n[truncated]" : output,
    bytes: Buffer.byteLength(output),
    provenance: "observed",
    artifactId: contentAddress(`${req.command} ${req.args.join(" ")}\u0000${req.subject ?? ""}\u0000${output}`),
  });

  const passed = proc.status === 0 && !timedOut;
  const establishes = timedOut
    ? "nothing: the check did not finish, so its claim is untested"
    : passed
      ? `the declared checks passed on subject ${req.subject ?? "(unbound)"}; this is not acceptance of the task`
      : `the declared checks failed on subject ${req.subject ?? "(unbound)"}`;

  const evidence = store.recordEvidence({
    taskId: action.taskId,
    actionId: action.actionId,
    artifactId: receipt.artifactId,
    claim: req.claim,
    observed: `exit ${proc.status ?? "none"}${timedOut ? " (timed out)" : ""} in ${durationMs}ms`,
    establishes,
    // A check that did not finish confirms nothing either way.
    confirmation: timedOut ? "unconfirmed" : passed ? "confirmed" : "refuted",
    criticality: "execution",
  });

  // Instrumented from the first run rather than reconstructed later.
  store.recordUsage({
    taskId: action.taskId,
    actionId: action.actionId,
    kind: "execution",
    inputTokens: null,
    outputTokens: null,
    durationMs,
    costMicros: opts.costMicros ?? null,
  });

  const done = completeAction(store, running);
  return {
    action: done,
    evidence,
    receiptArtifactId: receipt.artifactId,
    exitCode: proc.status,
    durationMs,
    timedOut,
  };
}
