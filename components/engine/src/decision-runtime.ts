import { configuredDecisionProvider, sameConfiguredDecisionProvider, decisionProviderAdapter, type DecisionProviderIdentity, type DecisionUsage } from "./decision-providers.ts";
import { readDecisionOutcome } from "./decision-outcome-reader.ts";
import { prepareDecisionRequest } from "./decision-request-preparation.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { projectContextMetric } from "./telemetry-projection.ts";
import { runtimeExecutionIdentity, type RuntimeExecutionIdentity } from "./runtime-execution-identity.ts";
import { digest, durableJson, object } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { DECISION_CONSUMERS, DECISION_QUESTIONS } from "./decision-catalog.ts";
import { reserveDecisionCall, closeDecisionScope, contextBudgetScope, contextFamilyScope, type BudgetScope, type BudgetReservation } from "./decision-budget.ts";
import { DecisionClient, decisionCancellationReason, type TransportOptions, type TransportTiming } from "./decision-transport.ts";
import { CONTEXT_OPERATION_MS } from "./context-timing.ts";
import { resolveConsumerMode, type DecisionSettings } from "./decision-settings.ts";
import {
  requestIdentity,
  metadataQuestionGroup, passageQuestionGroup,
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
  metadataPaths?: string[];
  evidenceLayout?: "compact-v1" | "shared-v1" | "per-question-v1";
  /** Isolate frequent prompt retrieval from check-time decision budgets without changing task identity. */
  budgetPartition?: "context-selection";
  budgetInvocationId?: string;
  budgetFamily?: boolean;
  /** Monotonic deadline shared by all batches in one retrieval. */
  deadlineAt?: number;
  signal?: AbortSignal;
  /** Legacy context evaluation preserves its explicitly approved source/synthetic data class. */
  legacyDataClass?: "source" | "diagnostic" | "synthetic";
  eligibilityDigest?: string | null;
  policyDigest: string;
  runId?: string;
}
export interface DecisionOutcome {
  version: 3; provider: DecisionProviderIdentity; consumerId: DecisionConsumerId; consumers: DecisionConsumerId[]; consumerVersion: string; caller: string;
  /** Labelled question-count allocation across a batch. Native usage is recorded once, never divided. */
  usageAllocation: Record<string, number>;
  mode: DecisionMode; ceiling: DecisionMode; effect: DecisionEffect; effectSource: "declared" | "default";
  entryKind?: DecisionAsk["entryKind"];
  configuredEffect?: DecisionEffect;
  requestId: string; requestIdentity: string | null; payloadDigest: string | null;
  scopeState: "bound" | "unavailable"; scope: BudgetScope | null;
  answers: Record<string, QuestionOutcome>;
  method: "baseline" | "provider"; reason: string; delivered: boolean;
  /** Whether this retained event attempted transport, including failed/uncertain paid calls. Absent in older receipts. */
  providerCalled?: boolean | undefined;
  model: string | null; latencyMs: number; usage: DecisionUsage;
  failureStage?: DecisionFailureStage;
  coverage: DecisionCoverage;
  budget: { state: BudgetReservation["state"] | "not-required"; reservationId: string | null; calls: number | null; bytes: number | null; limits: { maxCalls: number; maxRequestBytes: number }; partition?: "context-selection"; invocationId?: string; unavailableReason?: BudgetReservation["unavailableReason"] };
  tokenEstimate: number | null;
  transport?: TransportTiming;
  receiptId: string | null;
}

export interface DecisionRuntimeOptions extends TransportOptions {
  signal?: AbortSignal | undefined;
  client?: DecisionClient;
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
  readonly #client: DecisionClient;
  readonly #options: DecisionRuntimeOptions;
  readonly #executionIdentity: RuntimeExecutionIdentity;
  constructor(settings: DecisionSettings, stateRoot: string, options: DecisionRuntimeOptions = {}) {
    this.settings = settings; this.stateRoot = stateRoot; this.#options = options;
    this.#executionIdentity = runtimeExecutionIdentity();
    this.#client = options.client ?? new DecisionClient({ ...options, provider: settings.provider, healthScope: digest({ stateRoot, config: settings.configDigest }) });
  }

  /** Doctor and callers can read the resolved disposition without preparing evidence or calling out. */
  eligibility(consumerId: DecisionConsumerId, question?: "context.metadata-relevance/1") {
    const resolved = resolveConsumerMode(this.settings, consumerId);
    const consumer = DECISION_CONSUMERS[consumerId];
    const reasons: string[] = [];
    if (this.settings.mode === "off") reasons.push("global-off");
    if (this.settings.consumers[consumerId].mode === "off") reasons.push("consumer-off");
    if (!this.#client.tokenPresent) reasons.push("missing-token");
    const dataClass = consumerId === "DL03" && question === "context.metadata-relevance/1" ? "metadata" : consumer.dataClass;
    if (!this.settings.legacy.allowedDataClasses.includes(dataClass)) reasons.push("data-sharing-disabled");
    return { ...resolved, consumer, reasons, providerUse: reasons.length ? "disabled" as const : "eligible" as const };
  }

  #eventKey(ask: DecisionAsk): string {
    return digest({ workspace: ask.scope?.workspace ?? null, taskId: ask.budgetFamily ? null : ask.scope?.taskId ?? null,
      taskRevision: ask.budgetFamily ? null : ask.scope?.taskRevision ?? null, consumers: [...new Set([ask.consumerId, ...(ask.participants ?? [])])].sort(),
      eventId: ask.eventId, ...(ask.budgetPartition ? { budgetPartition: ask.budgetPartition, budgetInvocationId: ask.budgetInvocationId } : {}) }).slice(7, 39);
  }
  #receiptPath(key: string): string { return join(this.stateRoot, RECEIPT_COLLECTION, `${key}.json`); }

  /** Close after all batches settle; retained reservations still prevent duplicate charging. */
  closeContextInvocation(scope: BudgetScope, invocationId: string): boolean {
    return closeDecisionScope(this.stateRoot, contextBudgetScope(scope, invocationId));
  }

  #retained(key: string): DecisionOutcome | null {
    try {
      const path = this.#receiptPath(key);
      if (!existsSync(path) || statSync(path).size > 256 * 1024) return null;
      const receipt = object(JSON.parse(readFileSync(path, "utf8")));
      return readDecisionOutcome(receipt) as unknown as DecisionOutcome;
    } catch { return null; }
  }
  #record(key: string, outcome: DecisionOutcome): string | null {
    if (this.#options.receipts === false) return null;
    // Telemetry storage failure never alters the decision, the budget or native execution.
    try {
      const createdAt = new Date().toISOString();
      durableJson(this.#receiptPath(key), { version: 3, ...this.#executionIdentity, configDigest: this.settings.configDigest,
        receiptId: key, createdAt, outcome });
      if (outcome.scope) projectContextMetric(this.stateRoot, { id: key, workspace: outcome.scope.workspace, capturedAt: createdAt,
        kind: "decision", entryId: null, routeId: null, familyId: outcome.budget.invocationId ?? null,
        taskId: outcome.scope.taskId, taskRevision: outcome.scope.taskRevision, status: outcome.method, reason: outcome.reason,
        counts: { providerCalled: outcome.providerCalled === undefined ? null : Number(outcome.providerCalled), answered: Object.values(outcome.answers).filter(item => item.status === "answered").length,
          inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, latencyMs: outcome.latencyMs,
          httpMs: outcome.transport?.httpMs ?? null, admissionMs: outcome.transport?.admissionMs ?? null,
          requestBytes: outcome.transport?.requestBytes ?? null } });
      return key;
    }
    catch { return null; }
  }

  async ask(ask: DecisionAsk): Promise<DecisionOutcome> {
    try { if (ask.scope) ask = { ...ask, scope: { ...ask.scope, workspace: realpathSync(ask.scope.workspace) } }; }
    catch { ask = { ...ask, scope: null }; }
    const started = performance.now();
    const signals = [this.#options.signal, ask.signal].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    const metadata = metadataQuestionGroup(ask.consumerId, ask.questions);
    const passage = passageQuestionGroup(ask.consumerId, ask.questions);
    const limits = ask.budgetPartition === "context-selection" && (metadata || passage)
      ? this.settings.contextBudget : this.settings.budget;
    const resolved = this.eligibility(ask.consumerId, metadata ? "context.metadata-relevance/1" : undefined);
    const consumer = resolved.consumer;
    const requestId = randomUUID();
    const key = this.#eventKey(ask);
    const participants = [...new Set([ask.consumerId, ...(ask.participants ?? [])])];
    const allocation: Record<string, number> = Object.fromEntries(participants.map(id => [id, 0]));
    for (const question of ask.questions) allocation[question.consumerId] = (allocation[question.consumerId] ?? 0) + 1;
    const base: DecisionOutcome = {
      version: 3, provider: configuredDecisionProvider(this.settings.provider, this.settings.legacy.model, this.settings.configDigest),
      consumerId: ask.consumerId, consumers: participants, consumerVersion: consumer.version, caller: consumer.caller,
      usageAllocation: allocation,
      mode: resolved.mode, ceiling: resolved.ceiling,
      effect: ask.entryKind === "workflow-observe" ? "advise" : resolved.effect,
      configuredEffect: resolved.effect, entryKind: ask.entryKind ?? "registered-default", effectSource: resolved.effectSource,
      requestId, requestIdentity: null, payloadDigest: null,
      scopeState: ask.scope ? "bound" : "unavailable", scope: ask.scope,
      answers: {}, method: "baseline", reason: "off", delivered: false, providerCalled: false,
      model: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null }, coverage: ask.coverage,
      budget: { state: "not-required", reservationId: null, calls: null, bytes: null, limits: { ...limits } },
      tokenEstimate: null, receiptId: null,
    };
    const fallback = (reason: string, extra: Partial<DecisionOutcome> = {}): DecisionOutcome => {
      const outcome = { ...base, ...extra, reason, latencyMs: performance.now() - started };
      // A disabled or concurrent observation must not replace the original event receipt.
      outcome.receiptId = existsSync(this.#receiptPath(key)) ? null : this.#record(key, outcome);
      return outcome;
    };
    if (signal?.aborted) return fallback(decisionCancellationReason(signal));
    if (this.settings.mode === "off") return fallback("global-off");
    // Enabling one feature can never enable another: every batch participant is checked independently.
    if (participants.some(id => this.settings.consumers[id].mode === "off")) return fallback("consumer-off");
    if (participants.some(id => resolveConsumerMode(this.settings, id).mode !== resolved.mode)) return fallback("batch-incompatible");
    if (!ask.questions.length) return fallback("no-enabled-questions");
    if (!decisionProviderAdapter(this.settings.provider).layouts.includes(ask.evidenceLayout ?? "question-local-v1")) return fallback("unsupported-evidence-layout");
    if (ask.legacyDataClass !== undefined && (participants.length !== 1 || participants[0] !== "DL03" ||
      ask.questions.some(question => question.definitionId !== "legacy.context-rank/1"))) return fallback("data-sharing-disabled");
    if (ask.evidenceLayout && ask.evidenceLayout !== "shared-v1" && (participants.length !== 1 || ask.consumerId !== "DL03" || ask.legacyDataClass !== undefined ||
      !(metadata || passage && ["compact-v1", "shared-v1"].includes(ask.evidenceLayout)))) return fallback("data-sharing-disabled");
    const dataClass = (id: DecisionConsumerId) => metadata ? "metadata" : ask.legacyDataClass ?? DECISION_CONSUMERS[id].dataClass;
    if (participants.some(id => !this.settings.legacy.allowedDataClasses.includes(dataClass(id)))) return fallback("data-sharing-disabled");
    if (metadata && ask.sourcePaths?.length && (!this.settings.legacy.allowedDataClasses.includes("source") ||
      ask.sourcePaths.some(path => !ask.metadataPaths?.includes(path)))) return fallback("source-scope-disabled");
    if ((participants.some(id => dataClass(id) === "source") || metadata && ask.sourcePaths?.length) && (!(ask.sourcePaths?.length) || ask.sourcePaths.some(path =>
      path.startsWith("/") || path.includes("\\") || path.split("/").some(part => part === ".." || part === ".") ||
      !matchesPackPath(path, this.settings.legacy.allowedSourcePaths ?? [])))) return fallback("source-scope-disabled");
    if (metadata && (!ask.metadataPaths?.length || ask.metadataPaths.some(path => path.startsWith("/") || /[\x00-\x1f\\]/u.test(path) ||
      path.split("/").some(part => part === ".." || part === ".") || !matchesPackPath(path, this.settings.allowedMetadataPaths ?? [])))) return fallback("metadata-scope-disabled");
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
    if (ask.budgetFamily && !ask.budgetPartition || ask.budgetPartition && (ask.budgetPartition !== "context-selection" ||
      !(metadata || passage) || !/^[a-f0-9]{64}$/u.test(ask.budgetInvocationId ?? "")) ||
      ask.budgetInvocationId && !ask.budgetPartition) return fallback("budget-partition-incompatible");
    if (ask.deadlineAt !== undefined && !Number.isFinite(ask.deadlineAt)) return fallback("invalid-deadline");
    if (this.#client.adapter.id !== this.settings.provider) return fallback("provider-client-mismatch");
    if (!this.#client.tokenPresent) return fallback("missing-token");
    if (!ask.scope) return fallback("scope-unavailable");

    const preparation = prepareDecisionRequest(ask, this.settings, participants, requestId, limits);
    if (!preparation.ok) return fallback(preparation.reason, { tokenEstimate: preparation.tokenEstimate });
    const { request, body, payloadDigestValue, requestBytes, tokenEstimate } = preparation;

    const identity = requestIdentity(request);
    const retained = this.#retained(key);
    // Replaying a paid event also binds its exact transmitted question wording, without resetting spending.
    if (retained && sameConfiguredDecisionProvider(retained.provider, base.provider) && retained.requestIdentity === identity && retained.payloadDigest === payloadDigestValue && ["reserved", "duplicate"].includes(retained.budget.state))
      return { ...retained, requestId, reason: Object.keys(retained.answers).length ? "repeated-observation" : `repeated-${retained.reason}`,
        receiptId: key, latencyMs: performance.now() - started };
    // The reservation identity is the consumer-group event key, so one event cannot be spent twice.
    let admittedReservation: BudgetReservation | undefined;
    // Context selection has one operation deadline, including calls without an explicit caller cutoff.
    const providerDeadline = metadata || passage ? CONTEXT_OPERATION_MS : this.settings.legacy.deadlineMs;
    const deadlineAt = ask.deadlineAt ?? started + providerDeadline;
    if (performance.now() >= deadlineAt) return fallback("deadline", { requestIdentity: identity });
    const transport = await this.#client.ask(body, providerDeadline, signal, () => {
      const budgetScope = ask.budgetFamily ? contextFamilyScope(ask.scope!.workspace, ask.budgetInvocationId!)
        : ask.budgetPartition ? contextBudgetScope(ask.scope!, ask.budgetInvocationId!) : ask.scope!;
      admittedReservation = reserveDecisionCall(this.stateRoot, budgetScope, key, requestBytes, limits,
        { ...(ask.budgetFamily ? { familyId: ask.budgetInvocationId! } : {}), busyTimeoutMs: Math.max(0, Math.min(1000, this.#options.busyTimeoutMs ?? 250, Math.floor(deadlineAt - performance.now()))) });
      return admittedReservation.state === "reserved";
    }, () => { base.providerCalled = true; }, "provider", ask.deadlineAt);
    base.transport = transport.timing;
    const reservation = admittedReservation;
    if (!reservation) return fallback(transport.ok ? "admission-unavailable" : transport.reason,
      { requestIdentity: identity, payloadDigest: payloadDigestValue, tokenEstimate,
        failureStage: transport.ok ? "budget" : transport.failureStage });
    const budget = { state: reservation.state, reservationId: reservation.reservationId, calls: reservation.calls, bytes: reservation.bytes, limits: base.budget.limits,
      ...(reservation.unavailableReason ? { unavailableReason: reservation.unavailableReason } : {}),
      ...(ask.budgetPartition ? { partition: ask.budgetPartition, invocationId: ask.budgetInvocationId } : {}) };
    if (reservation.state === "duplicate") {
      const retained = this.#retained(key);
      return retained && sameConfiguredDecisionProvider(retained.provider, base.provider) && retained.requestIdentity === identity && retained.payloadDigest === payloadDigestValue ? { ...retained, requestId,
        reason: Object.keys(retained.answers).length ? "repeated-observation" : `repeated-${retained.reason}`, receiptId: key, latencyMs: performance.now() - started }
        : fallback("repeated-observation-unavailable", { budget, requestIdentity: identity });
    }
    if (reservation.state === "exhausted") return fallback("budget-exhausted", { budget, requestIdentity: identity, failureStage: "budget", tokenEstimate });
    if (reservation.state === "unavailable") return fallback(reservation.unavailableReason === "store-capacity" ? "budget-store-capacity" : "budget-unavailable",
      { budget, requestIdentity: identity, failureStage: "budget", tokenEstimate });

    const prepared: Partial<DecisionOutcome> = { requestIdentity: identity, payloadDigest: payloadDigestValue, budget, tokenEstimate };
    if (!transport.ok) return fallback(transport.reason, { ...prepared, failureStage: transport.failureStage });
    const rawModel = transport.raw && typeof transport.raw === "object" && !Array.isArray(transport.raw) ? (transport.raw as Record<string, unknown>).model : null;
    base.provider = { ...base.provider, returnedModel: typeof rawModel === "string" && rawModel.length <= 128 ? rawModel : null };
    let answers: Record<string, QuestionOutcome>, usage: DecisionOutcome["usage"], model: string;
    try {
      const envelope = decisionProviderAdapter(this.settings.provider).decode(transport.raw, request, DECISION_QUESTIONS, this.settings.legacy.model, payloadDigestValue);
      answers = envelope.answers; usage = envelope.usage; model = envelope.model;
    } catch { return fallback("invalid-or-unavailable", { ...prepared, usage: decisionProviderAdapter(this.settings.provider).usage(transport.raw), failureStage: "answer-validation" }); }
    if (signal?.aborted) return fallback(decisionCancellationReason(signal), { ...prepared, usage });
    const usable = Object.values(answers).some(answer => answer.status === "answered");
    const outcome: DecisionOutcome = { ...base, ...prepared, answers, usage, model,
      provider: { ...base.provider, returnedModel: model },
      method: resolved.mode === "auto" && usable ? "provider" : "baseline", delivered: resolved.mode === "auto" && usable,
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
