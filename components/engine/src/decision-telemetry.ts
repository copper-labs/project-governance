import { decisionOutcomeReport } from "./decision-outcomes.ts";
import { DECISION_FAILURE_STAGES } from "./decisions.ts";
import { opendirSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";
import { DECISION_CONSUMER_IDS } from "./decision-schema.ts";

/** Descriptive operational receipts only; frozen evaluation sets and source excerpts are never scanned. */
export function decisionTelemetry(root: string, options: { limit?: number; since?: string; outcomesManifest?: string } = {}) {
  // macOS temporary/state roots commonly have a /var -> /private/var alias.
  try { root = realpathSync(root); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const limit = options.limit ?? 1000, since = options.since === undefined ? -Infinity : Date.parse(options.since);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000 || Number.isNaN(since)) throw new Error("Invalid decision telemetry bounds");
  const counts = { inspected: 0, matched: 0, invalid: 0, without_decision: 0, delivered: 0, blocked: 0, stale: 0, jev_selected: 0, baseline_selected: 0 };
  const reasons: Record<string, number> = {}, kinds: Record<string, number> = {};
  const failureStages: Record<string, number> = {};
  const baselines = { lexical_context_1: 0, discovery_order_1: 0, unspecified: 0, unrecognized: 0 };
  const latency: number[] = [];
  let inputTokens = 0, outputTokens = 0, inputSamples = 0, outputSamples = 0, decisionSamples = 0;
  let readBytes = 0, truncated = false;
  let repeatedObservations = 0, unidentifiedUsage = 0;
  const seen = new Set<string>(), usageSeen = new Set<string>();
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
            if (decision.receiptId !== undefined && decision.receiptId !== null &&
                (typeof decision.receiptId !== "string" || !/^[a-f0-9]{32}$/u.test(decision.receiptId))) throw new Error("Invalid shared decision identity");
            const usageIdentity = decision.receiptId === undefined ? String(receipt.receiptId) : decision.receiptId as string | null;
            const firstUsage = usageIdentity !== null && !usageSeen.has(usageIdentity);
            if (usageIdentity === null) unidentifiedUsage++;
            else { if (!firstUsage) repeatedObservations++; usageSeen.add(usageIdentity); }
            if (firstUsage && usage.inputTokens !== null) { inputSamples++; inputTokens += Number(usage.inputTokens); }
            if (firstUsage && usage.outputTokens !== null) { outputSamples++; outputTokens += Number(usage.outputTokens); }
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
    usage_accounting: { repeated_observations: repeatedObservations, unidentified_usage_observations: unidentifiedUsage,
      denominator: "latency and decision_samples count caller observations; token samples count identified decisions; explicit null identity is excluded" },
    tokens: { decision_samples: decisionSamples, input_samples: inputSamples, output_samples: outputSamples,
      input_total: inputSamples ? inputTokens : null, output_total: outputSamples ? outputTokens : null },
    pilot: decisionPilotTelemetry(root, { limit, since }),
    ...(options.outcomesManifest ? { outcome_report: decisionOutcomeReport(root, options.outcomesManifest) } : {}),
    benefit_claim: "not-evaluated", avoided_llm_tokens: null };
}

/** One read-only projection of the shared operational receipts; native usage belongs to a batch. */
function decisionPilotTelemetry(root: string, options: { limit: number; since: number }) {
  const counts = { inspected: 0, matched: 0, invalid: 0, duplicate_reservations: 0 };
  const consumers: Record<string, { observations: number; delivered: number; questions: number }> = {};
  const reasons: Record<string, number> = {};
  const tokens = { input_samples: 0, output_samples: 0, input_total: 0, output_total: 0 };
  const seen = new Set<string>();
  let readBytes = 0, truncated = false;
  let entries: ReturnType<typeof opendirSync> | undefined;
  try {
    const directory = join(root, "decisions"), stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) throw new Error("Invalid decision collection");
    entries = opendirSync(directory);
    for (let entry = entries.readSync(); entry !== null; entry = entries.readSync()) {
      if (!/^[0-9a-f]{32}\.json$/u.test(entry.name)) continue;
      if (counts.inspected >= options.limit) { truncated = true; break; }
      counts.inspected++;
      try {
        const file = lstatSync(join(directory, entry.name));
        if (!file.isFile() || file.isSymbolicLink() || file.size > 256 * 1024) throw new Error("Invalid decision receipt");
        if (readBytes + file.size > 16 * 1024 * 1024) { truncated = true; break; }
        readBytes += file.size;
        const receipt = object(JSON.parse(narrativeFile(directory, entry.name)));
        if (receipt.version !== 2 || `${receipt.receiptId}.json` !== entry.name || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) throw new Error("Invalid receipt identity");
        if (Date.parse(receipt.createdAt) < options.since) continue;
        const outcome = object(receipt.outcome), usage = object(outcome.usage), budget = object(outcome.budget), allocation = object(outcome.usageAllocation);
        if (outcome.version !== 2 || !Array.isArray(outcome.consumers) || !outcome.consumers.length ||
            new Set(outcome.consumers).size !== outcome.consumers.length ||
            outcome.consumers.some(id => !(DECISION_CONSUMER_IDS as readonly unknown[]).includes(id)) ||
            typeof outcome.delivered !== "boolean" || typeof outcome.reason !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(outcome.reason)) throw new Error("Invalid decision metrics");
        for (const value of [usage.inputTokens, usage.outputTokens]) if (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("Invalid usage");
        for (const id of outcome.consumers as string[]) if (!Number.isSafeInteger(allocation[id]) || Number(allocation[id]) < 0) throw new Error("Invalid allocation");
        const reservation = budget.reservationId;
        if (reservation !== null && (typeof reservation !== "string" || !/^[0-9a-f]{32}$/u.test(reservation))) throw new Error("Invalid reservation identity");
        if (typeof reservation === "string") {
          if (seen.has(reservation)) { counts.duplicate_reservations++; continue; }
          seen.add(reservation);
        }
        counts.matched++;
        reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
        for (const id of outcome.consumers as string[]) {
          const totals = consumers[id] ??= { observations: 0, delivered: 0, questions: 0 };
          totals.observations++; if (outcome.delivered) totals.delivered++;
          totals.questions += Number(allocation[id]);
        }
        if (usage.inputTokens !== null) { tokens.input_samples++; tokens.input_total += Number(usage.inputTokens); }
        if (usage.outputTokens !== null) { tokens.output_samples++; tokens.output_total += Number(usage.outputTokens); }
      } catch { counts.invalid++; }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") counts.invalid++; }
  finally { entries?.closeSync(); }
  return { counts, consumers, reasons, tokens: { ...tokens,
    input_total: tokens.input_samples ? tokens.input_total : null, output_total: tokens.output_samples ? tokens.output_total : null },
    usage_allocation: "native usage counted once per reservation; question counts shown per consumer", truncated, read_bytes: readBytes,
    outcomes: "not-joined", avoided_llm_tokens: null, benefit_claim: "not-evaluated" };
}
