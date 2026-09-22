import { prepareDecisionRequest } from "./decision-request-preparation.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { digest, durableJson, object } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { DECISION_CONSUMERS, DECISION_QUESTIONS } from "./decision-catalog.ts";
import { reserveDecisionCall, type BudgetScope, type BudgetReservation } from "./decision-budget.ts";
import { JevDecisionClient, type TransportOptions } from "./decision-transport.ts";
import { resolveConsumerMode, type DecisionSettings } from "./decision-settings.ts";
import {
  decisionNativeUsage, parseDecisionEnvelope, requestIdentity,
  type DecisionConsumerId, type DecisionCoverage, type DecisionEffect, type DecisionFailureStage, type DecisionMode,
  type EvidenceItem, type QuestionInstance, type QuestionOutcome,
} from "./decision-schema.ts";

export interface DecisionAsk {
  consumerId: DecisionConsumerId;
  /** Registered code entry; observation can never acquire diagnostic execution capability. */
  entryKind?: "registered-default" | "workflow-observe" | "workflow-diagnose" | "provider-submit";
  /** Additional consumers sharing one compatible batch. Every participant must resolve to the same mode. */
  participants?: DecisionConsumerId[];
  /** A stable identity for the decision event; repeated observations of it reuse the retained result. */
  eventId: string;
  scope: BudgetScope | null;
  subject: { digest: string; revision: string; environment: string };
  evidence: EvidenceItem[];
  coverage: DecisionCoverage;
  questions: QuestionInstance[];
  /** Repository-relative source paths transmitted in this request, checked against the profile scope. */
  sourcePaths?: string[];
  /** Legacy context evaluation preserves its explicitly approved source/synthetic data class. */
  legacyDataClass?: "source" | "diagnostic" | "synthetic";
  eligibilityDigest?: string | null;
  policyDigest: string;
  runId?: string;
}
export interface DecisionOutcome {
  version: 2; consumerId: DecisionConsumerId; consumers: DecisionConsumerId[]; consumerVersion: string; caller: string;
  /** Labelled question-count allocation across a batch. Native usage is recorded once, never divided. */
  usageAllocation: Record<string, number>;
  mode: DecisionMode; ceiling: DecisionMode; effect: DecisionEffect; effectSource: "declared" | "default";
  entryKind?: DecisionAsk["entryKind"];
  configuredEffect?: DecisionEffect;
  requestId: string; requestIdentity: string | null; payloadDigest: string | null;
  scopeState: "bound" | "unavailable"; scope: BudgetScope | null;
  answers: Record<string, QuestionOutcome>;
  method: "baseline" | "jev"; reason: string; delivered: boolean;
  /** Whether this retained event attempted transport, including failed/uncertain paid calls. Absent in older receipts. */
  providerCalled?: boolean | undefined;
  model: string | null; latencyMs: number; usage: { inputTokens: number | null; outputTokens: number | null };
  failureStage?: DecisionFailureStage;
  coverage: DecisionCoverage;
  budget: { state: BudgetReservation["state"] | "not-required"; reservationId: string | null; calls: number | null; bytes: number | null; limits: { maxCalls: number; maxRequestBytes: number } };
  tokenEstimate: number | null;
  receiptId: string | null;
}

export interface DecisionRuntimeOptions extends TransportOptions {
  signal?: AbortSignal | undefined;
  client?: JevDecisionClient;
  /** Bounded SQLite contention window; the caller's deadline still bounds the whole decision. */
  busyTimeoutMs?: number;
  receipts?: boolean;
}

const RECEIPT_COLLECTION = "decisions";

/**
 * The shared entry every first-RC consumer uses. It owns eligibility, the transactional budget,
 * one bounded provider call, answer validation and the operational receipt. It owns no execution
 * authority: a caller decides what, if anything, a validated answer changes.
 */
export class DecisionRuntime {
  readonly settings: DecisionSettings;
  readonly stateRoot: string;
  readonly #client: JevDecisionClient;
  readonly #options: DecisionRuntimeOptions;
  constructor(settings: DecisionSettings, stateRoot: string, options: DecisionRuntimeOptions = {}) {
    this.settings = settings; this.stateRoot = stateRoot; this.#options = options;
    const healthEpoch = digest({ provider: "jev", model: settings.legacy.model, revision: settings.legacy.revision });
    this.#client = options.client ?? new JevDecisionClient(healthEpoch, join(stateRoot, "decision-provider-health.json"), options);
  }

  /** Doctor and callers can read the resolved disposition without preparing evidence or calling out. */
  eligibility(consumerId: DecisionConsumerId) {
    const resolved = resolveConsumerMode(this.settings, consumerId);
    const consumer = DECISION_CONSUMERS[consumerId];
    const reasons: string[] = [];
    if (this.settings.mode === "off") reasons.push("global-off");
    if (this.settings.consumers[consumerId].mode === "off") reasons.push("consumer-off");
    if (!this.#client.tokenPresent) reasons.push("missing-token");
    if (!this.settings.legacy.allowedDataClasses.includes(consumer.dataClass)) reasons.push("data-sharing-disabled");
    return { ...resolved, consumer, reasons, providerUse: reasons.length ? "disabled" as const : "eligible" as const };
  }

  #eventKey(ask: DecisionAsk): string {
    return digest({ workspace: ask.scope?.workspace ?? null, taskId: ask.scope?.taskId ?? null,
      taskRevision: ask.scope?.taskRevision ?? null, consumers: [...new Set([ask.consumerId, ...(ask.participants ?? [])])].sort(),
      eventId: ask.eventId }).slice(7, 39);
  }
  #receiptPath(key: string): string { return join(this.stateRoot, RECEIPT_COLLECTION, `${key}.json`); }

  #retained(key: string): DecisionOutcome | null {
    try {
      const path = this.#receiptPath(key);
      if (!existsSync(path) || statSync(path).size > 256 * 1024) return null;
      const receipt = object(JSON.parse(readFileSync(path, "utf8")));
      if (receipt["version"] !== 2 || !receipt["outcome"]) return null;
      return receipt["outcome"] as DecisionOutcome;
    } catch { return null; }
  }
  #record(key: string, outcome: DecisionOutcome): string | null {
    if (this.#options.receipts === false) return null;
    // Telemetry storage failure never alters the decision, the budget or native execution.
    try { durableJson(this.#receiptPath(key), { version: 2, receiptId: key, createdAt: new Date().toISOString(), outcome }); return key; }
    catch { return null; }
  }

  async ask(ask: DecisionAsk): Promise<DecisionOutcome> {
    try { if (ask.scope) ask = { ...ask, scope: { ...ask.scope, workspace: realpathSync(ask.scope.workspace) } }; }
    catch { ask = { ...ask, scope: null }; }
    const started = performance.now();
    const resolved = this.eligibility(ask.consumerId);
    const consumer = resolved.consumer;
    const requestId = randomUUID();
    const key = this.#eventKey(ask);
    const participants = [...new Set([ask.consumerId, ...(ask.participants ?? [])])];
    const allocation: Record<string, number> = Object.fromEntries(participants.map(id => [id, 0]));
    for (const question of ask.questions) allocation[question.consumerId] = (allocation[question.consumerId] ?? 0) + 1;
    const base: DecisionOutcome = {
      version: 2, consumerId: ask.consumerId, consumers: participants, consumerVersion: consumer.version, caller: consumer.caller,
      usageAllocation: allocation,
      mode: resolved.mode, ceiling: resolved.ceiling,
      effect: ask.entryKind === "workflow-observe" ? "advise" : resolved.effect,
      configuredEffect: resolved.effect, entryKind: ask.entryKind ?? "registered-default", effectSource: resolved.effectSource,
      requestId, requestIdentity: null, payloadDigest: null,
      scopeState: ask.scope ? "bound" : "unavailable", scope: ask.scope,
      answers: {}, method: "baseline", reason: "off", delivered: false, providerCalled: false,
      model: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null }, coverage: ask.coverage,
      budget: { state: "not-required", reservationId: null, calls: null, bytes: null, limits: { maxCalls: this.settings.budget.maxCalls, maxRequestBytes: this.settings.budget.maxRequestBytes } },
      tokenEstimate: null, receiptId: null,
    };
    const fallback = (reason: string, extra: Partial<DecisionOutcome> = {}): DecisionOutcome => {
      const outcome = { ...base, ...extra, reason, latencyMs: performance.now() - started };
      // A disabled or concurrent observation must not replace the original event receipt.
      outcome.receiptId = existsSync(this.#receiptPath(key)) ? null : this.#record(key, outcome);
      return outcome;
    };
    if (this.#options.signal?.aborted) return fallback("cancelled");
    if (this.settings.mode === "off") return fallback("global-off");
    // Enabling one feature can never enable another: every batch participant is checked independently.
    if (participants.some(id => this.settings.consumers[id].mode === "off")) return fallback("consumer-off");
    if (participants.some(id => resolveConsumerMode(this.settings, id).mode !== resolved.mode)) return fallback("batch-incompatible");
    if (!ask.questions.length) return fallback("no-enabled-questions");
    if (ask.legacyDataClass !== undefined && (participants.length !== 1 || participants[0] !== "DL03" ||
      ask.questions.some(question => question.definitionId !== "legacy.context-rank/1"))) return fallback("data-sharing-disabled");
    const dataClass = (id: DecisionConsumerId) => ask.legacyDataClass ?? DECISION_CONSUMERS[id].dataClass;
    if (participants.some(id => !this.settings.legacy.allowedDataClasses.includes(dataClass(id)))) return fallback("data-sharing-disabled");
    if (participants.some(id => dataClass(id) === "source") && (!(ask.sourcePaths?.length) || ask.sourcePaths.some(path =>
      path.startsWith("/") || path.includes("\\") || path.split("/").some(part => part === ".." || part === ".") ||
      !matchesPackPath(path, this.settings.legacy.allowedSourcePaths ?? [])))) return fallback("source-scope-disabled");
    if (ask.questions.some(question => !participants.includes(question.consumerId) ||
      !this.settings.questionIds[question.consumerId].includes(question.definitionId))) return fallback("question-disabled");
    // Effects form explicit capability sets, not a permission ladder. A question's metadata alone
    // must never turn a status read into an executable probe selection.
    const entry = ask.entryKind ?? "registered-default";
    if (!["registered-default", "workflow-observe", "workflow-diagnose", "provider-submit"].includes(entry) ||
      (entry !== "registered-default" && (participants.length !== 1 || ask.consumerId !== (entry === "provider-submit" ? "DL08" : "DL05"))) ||
      ask.questions.some(question => {
        const effect = DECISION_QUESTIONS[question.definitionId]?.effectCeiling;
        if (effect === "route-model") return entry !== "provider-submit" || !["advise", "route-model"].includes(resolved.effect);
        if (effect === "choose-read") return entry !== "workflow-diagnose" || resolved.effect !== "choose-read";
        if (entry === "workflow-diagnose") return true;
        return effect !== "advise" || (resolved.effect !== "advise" && !(entry === "workflow-observe" && resolved.effect === "choose-read"));
      })) return fallback("entry-effect-incompatible");
    if (!this.#client.tokenPresent) return fallback("missing-token");
    if (!ask.scope) return fallback("scope-unavailable");

    const preparation = prepareDecisionRequest(ask, this.settings, participants, requestId);
    if (!preparation.ok) return fallback(preparation.reason, { tokenEstimate: preparation.tokenEstimate });
    const { request, body, payloadDigestValue, requestBytes } = preparation;

    const identity = requestIdentity(request);
    // The reservation identity is the consumer-group event key, so one event cannot be spent twice.
    let admittedReservation: BudgetReservation | undefined;
    const remainingDeadline = Math.floor(this.settings.legacy.deadlineMs - (performance.now() - started));
    if (remainingDeadline < 1) return fallback("deadline", { requestIdentity: identity });
    const transport = await this.#client.ask(body, remainingDeadline, this.#options.signal, () => {
      admittedReservation = reserveDecisionCall(this.stateRoot, ask.scope!, key, requestBytes, this.settings.budget,
        { busyTimeoutMs: Math.max(0, Math.min(1000, this.#options.busyTimeoutMs ?? 250, Math.floor(this.settings.legacy.deadlineMs - (performance.now() - started)))) });
      return admittedReservation.state === "reserved";
    }, () => { base.providerCalled = true; });
    const reservation = admittedReservation;
    if (!reservation) return fallback(transport.ok ? "admission-unavailable" : transport.reason,
      { requestIdentity: identity, failureStage: transport.ok ? "budget" : transport.failureStage });
    const budget = { state: reservation.state, reservationId: reservation.reservationId, calls: reservation.calls, bytes: reservation.bytes, limits: base.budget.limits };
    if (reservation.state === "duplicate") {
      const retained = this.#retained(key);
      return retained && retained.requestIdentity === identity ? { ...retained, requestId,
        reason: Object.keys(retained.answers).length ? "repeated-observation" : `repeated-${retained.reason}`, receiptId: key, latencyMs: performance.now() - started }
        : fallback("repeated-observation-unavailable", { budget, requestIdentity: identity });
    }
    if (reservation.state === "exhausted") return fallback("budget-exhausted", { budget, requestIdentity: identity, failureStage: "budget", tokenEstimate: request.budget.tokenEstimate });
    if (reservation.state === "unavailable") return fallback("budget-unavailable", { budget, requestIdentity: identity, failureStage: "budget", tokenEstimate: request.budget.tokenEstimate });

    const prepared: Partial<DecisionOutcome> = { requestIdentity: identity, payloadDigest: payloadDigestValue, budget, tokenEstimate: request.budget.tokenEstimate };
    if (!transport.ok) return fallback(transport.reason, { ...prepared, failureStage: transport.failureStage });
    let answers: Record<string, QuestionOutcome>, usage: DecisionOutcome["usage"], model: string;
    try {
      const envelope = parseDecisionEnvelope(transport.raw, request, DECISION_QUESTIONS, this.settings.legacy.model, payloadDigestValue);
      answers = envelope.answers; usage = envelope.usage; model = envelope.model;
    } catch { return fallback("invalid-or-unavailable", { ...prepared, usage: decisionNativeUsage(transport.raw), failureStage: "answer-validation" }); }
    if (this.#options.signal?.aborted) return fallback("cancelled", { ...prepared, usage });
    const usable = Object.values(answers).some(answer => answer.status === "answered");
    const outcome: DecisionOutcome = { ...base, ...prepared, answers, usage, model,
      method: resolved.mode === "auto" && usable ? "jev" : "baseline", delivered: resolved.mode === "auto" && usable,
      reason: !usable ? "no-usable-answers" : resolved.mode === "auto" ? "answered" : "shadow", latencyMs: performance.now() - started };
    outcome.receiptId = this.#record(key, outcome);
    return outcome;
  }
}

/** Boolean interpretation regions are versioned data bound to the question; defaults are uncalibrated. */
export const NOUL_REGIONS = { supportedPositive: 0.75, supportedNegative: 0.25, calibration: "uncalibrated" } as const;
export function interpretNoul(outcome: QuestionOutcome | undefined): { value: "positive" | "negative" | "uncertain" | "unknown"; probability: number | null } {
  if (!outcome || outcome.status !== "answered" || outcome.shape !== "noul") return { value: "unknown", probability: null };
  if (outcome.probability >= NOUL_REGIONS.supportedPositive) return { value: "positive", probability: outcome.probability };
  if (outcome.probability <= NOUL_REGIONS.supportedNegative) return { value: "negative", probability: outcome.probability };
  return { value: "uncertain", probability: outcome.probability };
}
export function interpretChoice(outcome: QuestionOutcome | undefined): { value: string | null; confidence: number | null; margin: number | null } {
  if (!outcome || outcome.status !== "answered" || outcome.shape !== "choice") return { value: null, confidence: null, margin: null };
  const ordered = Object.values(outcome.probabilities).sort((a, b) => b - a);
  return { value: outcome.choice, confidence: outcome.confidence, margin: ordered.length > 1 ? (ordered[0]! - ordered[1]!) : null };
}
