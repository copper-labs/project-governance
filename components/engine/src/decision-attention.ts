import { digest, object, text } from "./core.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import { interpretChoice, type DecisionRuntime } from "./decision-runtime.ts";
import { workflowStageExcerpt } from "./decision-device-advice.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";
import type { BudgetScope } from "./decision-budget.ts";

/** Known lifecycle events need no model. Only explicitly supplied, native-bound residual text is eligible. */
export async function attentionAdvice(runtime: DecisionRuntime, native: { run: WorkflowRun; stages: WorkflowStage[]; events: unknown[] }, raw: unknown, scope: BudgetScope | null) {
  const eligibility = runtime.eligibility("DL06");
  const base = { version: 1, mode: eligibility.mode, effect: "advise", structuredEvents: native.events.length,
    eligible: 0, unassessed: 0, delivered: false, disposition: null as string | null, receiptId: null as string | null,
    actualAvoidedTurns: null, reason: "structured-events-only", authority: "observation only; native delivery and wait result unchanged" };
  if (eligibility.mode === "off") return { ...base, reason: "off" };
  if (!["queued", "running"].includes(native.run.state) || native.run.cancelRequested || native.stages.some(stage =>
    ["failed", "unknown", "blocked", "cancelled"].includes(stage.state) || stage.result?.cleanup === "unknown")) return { ...base, reason: "protected-state" };
  if (raw === null || raw === undefined) return base;
  const envelope = object(raw, "attention observation"), sequence = envelope.eventSequence;
  if (envelope.version !== 1 || envelope.runId !== native.run.id || !Number.isSafeInteger(sequence)) return { ...base, reason: "observation-unbound" };
  const event = native.events.map(value => object(value)).find(value => value.sequence === sequence);
  // Failed/terminal/cancellation deliveries are never candidates, including misleading host annotations.
  if (!event || event.kind !== "stage:succeeded") return { ...base, reason: "protected-or-structured-event" };
  const stageId = object(event.data).stageId, stage = native.stages.find(value => value.id === stageId);
  if (!stage || stage.state !== "succeeded") return { ...base, reason: "observation-stale" };
  const captured = workflowStageExcerpt(native.run, stage);
  if (!captured || captured.digest !== envelope.excerptDigest) return { ...base, reason: "excerpt-unbound" };
  if (/\b(error|fail(?:ed|ure)?|warn(?:ing)?|crash|exception|cancel(?:led)?|deadline|approval|permission|cleanup|operator)\b/iu.test(captured.text)) return { ...base, reason: "protected-output" };
  const purpose = text(envelope.purpose, "attention purpose", 2000), procedure = text(envelope.procedure, "ongoing procedure", 2000);
  const evidence = { purpose, procedure, event: { sequence, stageId }, excerpt: captured.text };
  const outcome = await runtime.ask({ consumerId: "DL06", eventId: `attention:${native.run.id}:iteration.attention-needed/1`, scope,
    subject: { digest: digest(evidence), revision: String(native.run.binding.taskVersion), environment: "workflow-wait-observation" },
    evidence: [{ id: "event", text: JSON.stringify(evidence), sourceDigest: digest(evidence), provenance: "captured", trust: "untrusted" }],
    coverage: { captured: 1, omitted: [], truncated: captured.truncated, unavailable: [], limits: ["first eligible observation per run; supplied purpose/procedure; no live routing"] },
    policyDigest: runtime.settings.configDigest, questions: [{ name: "attention", definitionId: "iteration.attention-needed/1", consumerId: "DL06", evidenceIds: ["event"],
      candidates: DECISION_QUESTIONS["iteration.attention-needed/1"]!.options!.map(id => ({ id, description: id })) }] });
  return { ...base, eligible: 1, unassessed: interpretChoice(outcome.answers.attention).value === null ? 1 : 0,
    reason: outcome.reason, receiptId: outcome.receiptId, delivered: outcome.delivered,
    disposition: outcome.delivered ? interpretChoice(outcome.answers.attention).value : null };
}
