import { canonical, object } from "./core.ts";
import { readDecisionProviderObservation } from "./decision-outcome-reader.ts";
import { decisionProviderAdapter, sameConfiguredDecisionProvider, type DecisionProviderIdentity } from "./decision-providers.ts";
import type { EvaluationReservation } from "./decision-budget.ts";
import type { EvaluationRequest, EvaluationResult } from "./evaluation-schema.ts";

/** A claim qualifies the original; malformed receipts never acquire reusable answer authority. */
export function readEvaluationOutcome(raw: unknown, request: EvaluationRequest, identity: string, payloadDigest: string,
  provider: DecisionProviderIdentity, claim: EvaluationReservation): EvaluationResult {
  const receipt = object(raw), outcome = object(receipt.outcome);
  const allowed = ["version", "kind", "evaluationId", "requestId", "receiptId", "requestIdentity", "payloadDigest", "provider", "effect", "status", "reason", "providerCalled", "answers", "evidence", "association", "coverage", "budget", "usage", "tokenEstimate", "timing"];
  if (Object.keys(outcome).some(key => !allowed.includes(key)) || receipt.version !== 3 || outcome.version !== 3 || outcome.kind !== "supplied-evaluation" ||
    outcome.evaluationId !== request.evaluationId || outcome.requestIdentity !== identity || outcome.payloadDigest !== payloadDigest ||
    outcome.effect !== "advise" || outcome.providerCalled !== true || !["complete", "partial", "invalid", "unsupported", "unavailable"].includes(String(outcome.status))) throw new Error("evaluation-receipt-invalid");
  if (canonical(outcome.association) !== canonical(request.association ?? null)) throw new Error("evaluation-receipt-association-invalid");
  const observation = readDecisionProviderObservation(outcome);
  if (!sameConfiguredDecisionProvider(observation.identity, provider)) throw new Error("evaluation-receipt-provider-invalid");
  const budget = object(outcome.budget);
  if (budget.reservationId !== claim.reservationId || budget.window !== claim.window || budget.requestIdentity !== identity || !["reserved", "duplicate"].includes(String(budget.state))) throw new Error("evaluation-receipt-claim-invalid");
  const answers = object(outcome.answers);
  if (canonical(Object.keys(answers).sort()) !== canonical(request.questions.map(question => question.name).sort())) throw new Error("evaluation-receipt-answer-coverage-invalid");
  const adapter = decisionProviderAdapter(provider.id), natives: Array<Record<string, unknown>> = [];
  for (const [name, raw] of Object.entries(answers)) {
    const answer = object(raw);
    if (!["answered", "unknown", "refused", "unsupported", "unavailable", "invalid"].includes(String(answer.status))) throw new Error("evaluation-receipt-answer-invalid");
    if (["answered", "unknown", "refused"].includes(String(answer.status))) natives.push({ ...object(answer.native), ...(provider.id === "openai" ? { name } : {}) });
    else if (Object.keys(answer).some(key => !["status", "reason"].includes(key)) || typeof answer.reason !== "string" || answer.reason.length > 120) throw new Error("evaluation-receipt-failure-invalid");
  }
  if (natives.length) {
    const raw = { model: observation.identity.returnedModel, answers: provider.id === "openai" ? natives
      : Object.fromEntries(Object.entries(answers).filter(([, value]) => ["answered", "unknown", "refused"].includes(String(object(value).status))).map(([name, value]) => [name, object(value).native])) };
    const decoded = adapter.decodeSupplied(raw, request.questions, provider.requestedModel!, payloadDigest);
    for (const [name, value] of Object.entries(answers)) if (["answered", "unknown", "refused"].includes(String(object(value).status)) && canonical(value) !== canonical(decoded.answers[name])) throw new Error("evaluation-receipt-answer-conflict");
  }
  const valid = Object.values(answers).filter(answer => ["answered", "unknown", "refused"].includes(String(object(answer).status))).length;
  if ((outcome.status === "complete") !== (valid === request.questions.length)) throw new Error("evaluation-receipt-status-conflict");
  const timing = object(outcome.timing);
  for (const key of ["preparationMs", "providerMs", "totalMs"]) if (typeof timing[key] !== "number" || !Number.isFinite(timing[key]) || Number(timing[key]) < 0) throw new Error("evaluation-receipt-timing-invalid");
  return outcome as unknown as EvaluationResult;
}
