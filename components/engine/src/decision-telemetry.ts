import { DECISION_FAILURE_STAGES } from "./decisions.ts";
import { opendirSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";

/** Descriptive operational receipts only; frozen evaluation sets and source excerpts are never scanned. */
export function decisionTelemetry(root: string, options: { limit?: number; since?: string } = {}) {
  const limit = options.limit ?? 1000, since = options.since === undefined ? -Infinity : Date.parse(options.since);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000 || Number.isNaN(since)) throw new Error("Invalid decision telemetry bounds");
  const counts = { inspected: 0, matched: 0, invalid: 0, without_decision: 0, delivered: 0, blocked: 0, stale: 0, jev_selected: 0, baseline_selected: 0 };
  const reasons: Record<string, number> = {}, kinds: Record<string, number> = {};
  const failureStages: Record<string, number> = {};
  const baselines = { lexical_context_1: 0, discovery_order_1: 0, unspecified: 0, unrecognized: 0 };
  const latency: number[] = [];
  let inputTokens = 0, outputTokens = 0, inputSamples = 0, outputSamples = 0, decisionSamples = 0;
  let readBytes = 0, truncated = false;
  const seen = new Set<string>();
  outer: for (const collection of ["receipts", "routes"]) {
    const directory = join(root, collection);
    let entries: ReturnType<typeof opendirSync>;
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) throw new Error("Invalid receipt directory");
      entries = opendirSync(directory);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; counts.invalid++; continue; }
    try {
      for (let entry = entries.readSync(); entry !== null; entry = entries.readSync()) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/u.test(entry.name)) continue;
        if (counts.inspected >= limit) { truncated = true; break outer; }
        counts.inspected++;
        try {
          const path = join(directory, entry.name), stat = lstatSync(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error("Invalid receipt");
          if (readBytes + stat.size > 16 * 1024 * 1024) { truncated = true; break outer; }
          readBytes += stat.size;
          const receipt = object(JSON.parse(narrativeFile(directory, entry.name)));
          if (receipt.version !== 1 || `${receipt.receiptId}.json` !== entry.name || seen.has(String(receipt.receiptId)) ||
              typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) throw new Error("Invalid receipt identity");
          seen.add(String(receipt.receiptId));
          if (Date.parse(receipt.createdAt) < since) continue;
          const outcome = receipt.outcome;
          if (!["delivered", "blocked", "refused-stale-source"].includes(String(outcome))) throw new Error("Invalid decision outcome");
          const optional = collection === "routes" ? (receipt.optional === null ? null : object(receipt.optional)) : receipt;
          const decision = optional?.decision === null || optional === null ? null : object(optional.decision);
          if (decision) {
            if (decision.version !== 1 || !["baseline", "jev"].includes(String(decision.method)) ||
                !["rank_optional_context", "rank_diagnostics", "advise_intent"].includes(String(decision.kind)) ||
                typeof decision.reason !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(decision.reason) ||
                typeof decision.latencyMs !== "number" || !Number.isFinite(decision.latencyMs) || decision.latencyMs < 0) throw new Error("Invalid decision metrics");
            const usage = object(decision.usage);
            for (const value of [usage.inputTokens, usage.outputTokens]) if (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("Invalid token observation");
            if (decision.baselineVersion !== undefined && typeof decision.baselineVersion !== "string") throw new Error("Invalid baseline version");
            const baseline = decision.baselineVersion === undefined ? "unspecified" : decision.baselineVersion === "lexical-context-1" ? "lexical_context_1"
              : decision.baselineVersion === "discovery-order-1" ? "discovery_order_1" : "unrecognized";
            if (decision.failureStage !== undefined && !DECISION_FAILURE_STAGES.includes(decision.failureStage as typeof DECISION_FAILURE_STAGES[number])) throw new Error("Invalid failure stage");
            if (typeof decision.failureStage === "string") failureStages[decision.failureStage] = (failureStages[decision.failureStage] ?? 0) + 1;
            baselines[baseline]++;
            decisionSamples++; latency.push(decision.latencyMs);
            counts[decision.method === "jev" ? "jev_selected" : "baseline_selected"]++;
            reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
            const kind = String(decision.kind); kinds[kind] = (kinds[kind] ?? 0) + 1;
            if (usage.inputTokens !== null) { inputSamples++; inputTokens += Number(usage.inputTokens); }
            if (usage.outputTokens !== null) { outputSamples++; outputTokens += Number(usage.outputTokens); }
          } else counts.without_decision++;
          counts.matched++;
          counts[outcome === "refused-stale-source" ? "stale" : outcome === "blocked" ? "blocked" : "delivered"]++;
        } catch { counts.invalid++; }
      }
    } finally { entries.closeSync(); }
  }
  latency.sort((a, b) => a - b);
  const percentile = (fraction: number) => latency.length ? latency[Math.ceil(latency.length * fraction) - 1] : null;
  return { version: 1, kind: "project-governance-decision-telemetry", scope: "operational-context-receipts", counts, reasons, kinds, baselines, failure_stages: failureStages,
    truncated, selection: "bounded-directory-scan; not a representative sample", read_bytes: readBytes,
    latency_ms: { samples: latency.length, median: percentile(0.5), p95: percentile(0.95) },
    tokens: { decision_samples: decisionSamples, input_samples: inputSamples, output_samples: outputSamples,
      input_total: inputSamples ? inputTokens : null, output_total: outputSamples ? outputTokens : null },
    benefit_claim: "not-evaluated", avoided_llm_tokens: null };
}
