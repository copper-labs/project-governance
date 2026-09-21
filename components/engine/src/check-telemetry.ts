import { readRunProjection } from "./telemetry-projection.ts";
import { closeSync, constants, fstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { durableJson, object } from "./core.ts";

/** Read compact operational records with a hard byte bound, never native logs or source packets. */
function record(path: string): Record<string, unknown> | null {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try {
    const before = fstatSync(fd), limit = 256 * 1024;
    if (!before.isFile() || before.size > limit) throw new Error("Invalid telemetry record");
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length < bytes.length) { const count = readSync(fd, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
    const after = fstatSync(fd);
    if (length > limit || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Telemetry changed during read");
    return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))));
  } finally { closeSync(fd); }
}
const dispositions = new Set(["confirmed-issue", "false-positive", "mixed", "unreviewed"]);

/** An annotation describes an observed result; it never changes that result or its acceptance. */
export function reviewCheckRun(root: string, workspace: string, runId: string, disposition: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(runId) || !dispositions.has(disposition)) throw new Error("Invalid telemetry review annotation");
  const directory = join(realpathSync(root), runId);
  if (realpathSync(directory) !== directory) throw new Error("Invalid telemetry run directory");
  const metric = record(join(directory, "metrics.json"));
  if (metric?.["version"] !== 1 || metric["run_id"] !== runId || metric["workspace"] !== realpathSync(workspace) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(metric["result_digest"]))) throw new Error("Run is not retained in this workspace");
  durableJson(join(directory, "review.json"), { version: 1, run_id: runId, result_digest: metric["result_digest"], disposition });
  return { status: "recorded", run_id: runId, disposition };
}

export interface RunMetric {
  version: 1; trigger?: "manual" | "hook" | "test"; expected_status?: "passed" | "failed" | "warning" | "blocked"; run_id: string; workspace: string; stage: string | null; runtime_version: string;
  status: string; termination_reason: string; duration_ms: number; started_at: string; ended_at: string;
  pack_count: number; command_count: number; blocked_pack_count: number; result_digest: string;
}
/** Descriptive timing is not proof of improvement; missing runs and model usage remain explicit. */
export function checkTelemetry(root: string, workspace: string, options: { stage?: string; since?: string; runtimeVersion?: string; trigger?: string; limit?: number } = {}) {
  if (options.trigger && !["manual", "hook", "test"].includes(options.trigger)) throw new Error("Invalid telemetry trigger");
  const target = realpathSync(workspace), limit = options.limit ?? 1000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid telemetry limit");
  const since = options.since === undefined ? -Infinity : Date.parse(options.since);
  if (Number.isNaN(since)) throw new Error("Invalid telemetry start time");
  let names: string[];
  try { names = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^[0-9a-f-]{36}$/u.test(entry.name)).map(entry => entry.name).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; names = []; }
  const counts = { passed: 0, warning: 0, failed: 0, cancelled: 0, unfinished_or_unprojected: 0, invalid: 0 };
  const reviewCounts: Record<string, number> = {};
  const expectationCounts = { unspecified: 0, matched: 0, unexpected: 0, invalid: 0 };
  const durations: number[] = []; let packs = 0, commands = 0, blocked = 0, matched = 0;
  for (const id of names.slice(0, limit)) {
    try {
      const metric = record(join(root, id, "metrics.json"));
      if (!metric) {
        const intent = record(join(root, id, "run.json"));
        if (intent?.["root"] === target) {
          const plan = intent["plan"] && typeof intent["plan"] === "object" ? object(intent["plan"]) : {};
          if (options.stage && plan["stage"] !== options.stage) continue;
          if (options.since && !(Date.parse(String(intent["started_at"])) >= since)) continue;
          if (options.trigger && intent["trigger"] !== options.trigger) continue;
          if (options.runtimeVersion) continue; // An unfinished intent does not establish a runtime version.
          matched++; counts.unfinished_or_unprojected++;
        }
        continue;
      }
      if (metric["workspace"] !== target) continue;
      if (options.trigger && metric["trigger"] !== options.trigger) continue;
      if (options.runtimeVersion && metric["runtime_version"] !== options.runtimeVersion) continue;
      if (metric["version"] !== 1 || metric["run_id"] !== id || !["passed", "warning", "failed"].includes(String(metric["status"])) ||
        !/^sha256:[0-9a-f]{64}$/u.test(String(metric["result_digest"]))) throw new Error("Invalid metric identity");
      const started = Date.parse(String(metric["started_at"]));
      if (!Number.isFinite(started)) throw new Error("Invalid metric timestamp");
      if (started < since || (options.stage && metric["stage"] !== options.stage)) continue;
      for (const key of ["duration_ms", "pack_count", "command_count", "blocked_pack_count"]) if (typeof metric[key] !== "number" || !Number.isSafeInteger(metric[key]) || metric[key] < 0) throw new Error("Invalid metric count");
      let review: Record<string, unknown> | null;
      try { review = record(join(root, id, "review.json")); } catch { review = {}; }
      const disposition = review === null ? "unreviewed" : review["version"] === 1 && review["run_id"] === id && review["result_digest"] === metric["result_digest"] && dispositions.has(String(review["disposition"])) ? String(review["disposition"]) : "invalid-review";
      const expected = metric["expected_status"];
      const expectation = expected === undefined ? "unspecified" : metric["trigger"] !== "test" || !["passed", "failed", "warning", "blocked"].includes(String(expected)) ? "invalid" : expected === metric["status"] ? "matched" : "unexpected";
      expectationCounts[expectation]++;
      reviewCounts[disposition] = (reviewCounts[disposition] ?? 0) + 1;
      matched++; counts[metric["status"] as "passed" | "warning" | "failed"]++;
      if (metric["termination_reason"] === "cancelled") counts.cancelled++;
      durations.push(metric["duration_ms"] as number); packs += metric["pack_count"] as number; commands += metric["command_count"] as number; blocked += metric["blocked_pack_count"] as number;
    } catch { counts.invalid++; }
  }
  durations.sort((a, b) => a - b);
  const percentile = (fraction: number) => durations.length ? durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] : null;
  const { metrics: retained, ...projection } = readRunProjection(root, target);
  return { rolling_projection: { ...projection, retained_records: retained.length, write_coverage: "not-verified", rejected_writes: null }, version: 1, kind: "project-governance-check-telemetry", workspace: target, scope: "native-check-runs", scanned_runs: Math.min(names.length, limit), matched_runs: matched,
    truncated: names.length > limit, counts, review_disposition_counts: reviewCounts, expectation_counts: expectationCounts, elapsed_ms: { samples: durations.length, median: percentile(0.5), p95: percentile(0.95), total: durations.reduce((a, b) => a + b, 0) },
    pack_count: packs, command_count: commands, blocked_pack_count: blocked, model_tokens: null, token_coverage: "unavailable", benefit_claim: "not-evaluated" };
}
