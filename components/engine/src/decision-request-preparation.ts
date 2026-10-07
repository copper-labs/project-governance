import { decisionProviderAdapter } from "./decision-providers.ts";
import { canonical, digest, object } from "./core.ts";
import { DECISION_CONSUMERS, DECISION_QUESTIONS } from "./decision-catalog.ts";
import { DECISION_SCHEMA_VERSION, estimateTokens, validateDecisionRequest, METADATA_MAX_QUESTIONS, metadataQuestionGroup, type DecisionConsumerId, type DecisionRequest2 } from "./decision-schema.ts";
import type { DecisionAsk } from "./decision-runtime.ts";
import type { DecisionBudgetLimits, DecisionSettings } from "./decision-settings.ts";

/** Prepare and bound one immutable payload before its operational budget can be reserved. */
export function prepareDecisionRequest(ask: DecisionAsk, settings: DecisionSettings, participants: DecisionConsumerId[], requestId: string, limits: DecisionBudgetLimits) {
    const adapter = decisionProviderAdapter(settings.provider);
    const request: DecisionRequest2 = {
      schemaVersion: DECISION_SCHEMA_VERSION, requestId, consumerId: ask.consumerId, consumers: participants, consumerVersion: DECISION_CONSUMERS[ask.consumerId].version,
      ...(ask.evidenceLayout ? { evidenceLayout: ask.evidenceLayout } : {}),
      entryKind: ask.entryKind ?? "registered-default",
      scope: { workspace: ask.scope!.workspace, taskId: ask.scope!.taskId, taskRevision: ask.scope!.taskRevision, ...(ask.runId ? { runId: ask.runId } : {}) },
      subject: ask.subject, evidence: ask.evidence, coverage: ask.coverage, questions: ask.questions,
      eligibilityDigest: ask.eligibilityDigest ?? null, policyDigest: ask.policyDigest, configDigest: settings.configDigest,
      budget: { deadlineMs: settings.legacy.deadlineMs, maxQuestions: metadataQuestionGroup(ask.consumerId, ask.questions) ? METADATA_MAX_QUESTIONS : 64,
        maxRequestBytes: Math.min(limits.maxRequestBytes, adapter.policy.maxRequestBytes), maxCandidates: participants.every(id => id === "DL03") ? Math.max(2, settings.legacy.maxCandidates + 1) : 65,
        tokenEstimate: settings.provider === "jev" ? 0 : null, tokenMethod: settings.provider === "jev" ? "UTF-8 bytes upper estimate" : "unavailable" },
    };
    let body: string, payloadDigestValue: string, requestBytes: number;
    try {
      validateDecisionRequest(request, DECISION_QUESTIONS, settings.provider);
      if (request.evidence.reduce((bytes, item) => bytes + Buffer.byteLength(item.text), 0) > settings.legacy.evidenceBytes) return { ok: false as const, reason: "input-budget", tokenEstimate: null };
      if (!adapter.layouts.includes(ask.evidenceLayout ?? "question-local-v1")) return { ok: false as const, reason: "unsupported-evidence-layout", tokenEstimate: null };
      const payload = adapter.payload(request, DECISION_QUESTIONS, settings.legacy.model);
      request.budget.tokenEstimate = settings.provider === "jev" ? estimateTokens(payload) : null;
      body = canonical(payload);
      requestBytes = Buffer.byteLength(body);
      payloadDigestValue = digest(payload);
      // The documented product limits stay separate from our own byte bound.
      if (settings.provider === "jev" && request.budget.tokenEstimate! > 64_000) return { ok: false as const, reason: "input-budget", tokenEstimate: request.budget.tokenEstimate };
      if (settings.provider === "jev" && estimateTokens(object(payload).state) + Math.max(...Object.values(object(object(payload).questions)).map(estimateTokens)) > 32_000)
        return { ok: false as const, reason: "input-budget", tokenEstimate: request.budget.tokenEstimate };
      if (requestBytes > request.budget.maxRequestBytes) return { ok: false as const, reason: "input-budget", tokenEstimate: request.budget.tokenEstimate };
    } catch { return { ok: false as const, reason: "preparation-invalid", tokenEstimate: null }; }

    return { ok: true as const, request, body, payloadDigestValue, requestBytes, tokenEstimate: settings.provider === "jev" ? request.budget.tokenEstimate : null };
}
