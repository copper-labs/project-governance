import { realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { digest, object, text } from "./core.ts";
import { providerTelemetry } from "./provider-telemetry.ts";
import type { EvaluationCost, EvaluationReference } from "./release-evaluation-types.ts";

export const measuredNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const tokens = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const sumKnown = (...values: Array<number | null>) => values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
export type ReadReference = (raw: unknown) => { reference: EvaluationReference; record: Record<string, unknown> };

/** The provider owner interprets native fields; this adapter chooses one accounting scope. */
export function providerEvaluationCost(raw: unknown, read: ReadReference): { cost: EvaluationCost; runtimeVersion: string | null; archiveDigest: string | null } {
  const job = object(raw), directory = realpathSync(text(job.directory, "provider directory"));
  const request = read(job.request), result = read(job.result);
  if (request.reference.path !== join(directory, "request.json") || result.reference.path !== join(directory, "result.json") ||
      request.record.version !== 1 || digest(request.record) !== job.requestDigest || result.record.requestDigest !== job.requestDigest)
    throw new Error("provider-job-link-mismatch");
  const provider = object(request.record.provider), providerKind = String(provider.kind);
  let nativeIdentity: Record<string, unknown> | null = null;
  const captures = new Map([["request.json", request], ["result.json", result]]);
  if (result.record.providerResult !== undefined) {
    if (result.record.providerResult !== join(directory, "provider-result.json")) throw new Error("provider-result-location-mismatch");
    const captured = read({ path: result.record.providerResult, digest: result.record.providerResultDigest });
    if (captured.record.version !== 1 || captured.record.requestDigest !== job.requestDigest) throw new Error("provider-result-link-mismatch");
    if (captured.record.identity !== undefined && captured.record.identity !== null) nativeIdentity = object(captured.record.identity);
    captures.set("provider-result.json", captured);
  }
  // Retain the existing provider validator and usage mapping, including custom job directories.
  const report = providerTelemetry([{ directory, requestDigest: String(job.requestDigest) }], { read: (selected, name) => {
    const capture = captures.get(name);
    if (selected !== directory || !capture) throw new Error("provider-capture-unavailable");
    return { value: capture.record, digest: capture.reference.digest };
  } });
  const sample = report.samples[0];
  if (report.counts.matched !== 1 || !sample) throw new Error("provider-artifact-invalid");
  const values = sample.reportedUsage;
  let input: number | null = null, fresh: number | null = null, cached: number | null = null, creation: number | null = null, output: number | null = null;
  let accounting = "unsupported-or-absent-native-usage";
  if (providerKind === "claude") {
    fresh = tokens(values["usage.input_tokens"]); cached = tokens(values["usage.cache_read_input_tokens"]);
    creation = tokens(values["usage.cache_creation_input_tokens"]); output = tokens(values["usage.output_tokens"]);
    input = sumKnown(fresh, cached, creation);
    accounting = "native aggregate only; per-model diagnostics are not added";
  } else if (providerKind === "codex") {
    // `last` is only one response. It cannot establish complete multi-response job usage.
    input = tokens(values["total.inputTokens"]); output = tokens(values["total.outputTokens"]);
    cached = tokens(values["total.cachedInputTokens"]);
    if (input !== null && cached !== null && cached <= input) fresh = input - cached;
    else if (cached !== null && input !== null) throw new Error("invalid-cached-token-subset");
    accounting = "job cumulative total only; last-response increments are not added";
  }
  if (provider.conversationId !== undefined) {
    // A resumed session's cumulative counters include previous work. There is no qualified delta.
    input = null; fresh = null; cached = null; creation = null; output = null;
    accounting = "resumed session has no qualified pre-job usage baseline; cumulative counters are not job cost";
  }
  const scopeKey = providerKind === "codex" && typeof nativeIdentity?.conversationId === "string" && typeof nativeIdentity?.turnId === "string"
    ? `codex-turn:${digest([nativeIdentity.conversationId, nativeIdentity.turnId])}` : null;
  return { cost: { id: `provider-job:${providerKind}:${String(job.requestDigest)}`, owner: "provider-job", provider: providerKind,
    inputTokens: input, freshInputTokens: fresh, cachedInputTokens: cached, cacheCreationInputTokens: creation,
    outputTokens: output, reasoningTokens: null, estimatedUSD: provider.conversationId === undefined ? measuredNumber(values.estimated_cost_usd) : null, durationMs: sample.durationMs,
    allocation: "episode", requestedModel: sample.requestedModel, reportedModels: sample.reportedModels ? Object.keys(sample.reportedModels).sort() : null,
    scopeKey, accounting, reference: result.reference }, runtimeVersion: typeof result.record.runtimeVersion === "string" ? result.record.runtimeVersion : null,
    archiveDigest: typeof result.record.archiveDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(result.record.archiveDigest) ? result.record.archiveDigest : null };
}

/** Native turn usage remains unallocated after a task switch; a later bind cannot claim it. */
export function nativeEvaluationCost(record: Record<string, unknown>, reference: EvaluationReference, entry: Record<string, unknown>, switched: boolean): EvaluationCost {
  if (record.version !== 1 || record.kind !== "usage" || record.entryId !== entry.entryId) throw new Error("native-usage-entry-mismatch");
  const usage = object(record.usage);
  if (usage.source !== "codex-token-usage-v1" || usage.session !== entry.session || usage.turn !== entry.turn ||
      typeof usage.responseId !== "string" || !usage.responseId || usage.responseId.length > 256) throw new Error("native-usage-identity-mismatch");
  const input = tokens(usage.inputTokens), output = tokens(usage.outputTokens), cached = tokens(usage.cachedInputTokens), reasoning = tokens(usage.reasoningTokens);
  if ((input !== null && cached !== null && cached > input) || (output !== null && reasoning !== null && reasoning > output)) throw new Error("native-token-subset-invalid");
  return { id: `native-response:codex:${digest([usage.session, usage.responseId])}`, owner: "native-response", provider: "codex",
    inputTokens: input, freshInputTokens: input !== null && cached !== null ? input - cached : null,
    cachedInputTokens: cached, cacheCreationInputTokens: tokens(usage.cacheWriteInputTokens), outputTokens: output,
    reasoningTokens: reasoning, estimatedUSD: null, durationMs: null, allocation: switched ? "turn-unallocated" : "episode", requestedModel: null, reportedModels: null,
    scopeKey: `codex-turn:${digest([usage.session, usage.turn])}`,
    accounting: "incremental native response; cached input and reasoning are subsets, not extra tokens", reference };
}

export function jevEvaluationCost(record: Record<string, unknown>, reference: EvaluationReference): EvaluationCost | null {
  const outcome = object(record.outcome), budget = object(outcome.budget ?? {}), usage = object(outcome.usage ?? {});
  if (record.version !== 2 || outcome.version !== 2) throw new Error("decision-cost-version-invalid");
  if (outcome.providerCalled !== true) return null;
  if (typeof budget.reservationId !== "string" || !/^[a-f0-9]{32}$/u.test(budget.reservationId)) throw new Error("decision-cost-reservation-missing");
  return { id: `jev-reservation:${budget.reservationId}`, owner: "jev-reservation", provider: "jev",
    inputTokens: tokens(usage.inputTokens), freshInputTokens: null, cachedInputTokens: null, cacheCreationInputTokens: null,
    outputTokens: tokens(usage.outputTokens), reasoningTokens: null, estimatedUSD: null,
    durationMs: measuredNumber(object(outcome.transport ?? {}).httpMs), allocation: "episode", requestedModel: null, reportedModels: null,
    scopeKey: null, accounting: "one native usage observation per JEV reservation; HTTP duration is not episode wall time", reference };
}

export function canonicalEvidencePath(path: string, manifestDirectory: string) {
  return resolve(manifestDirectory, path);
}
