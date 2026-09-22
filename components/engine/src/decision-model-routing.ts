import { digest } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";
import { DecisionRuntime, interpretChoice, type DecisionRuntimeOptions } from "./decision-runtime.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { decisionTaskPurpose, type DecisionTaskContext } from "./decision-task-context.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { qualifiedProviderPair, type ProviderAdmission } from "./provider-admission.ts";

/** One bounded classification. Code applies the operator map only at authorized new submission. */
export async function routeProviderModel(admission: ProviderAdmission, task: DecisionTaskContext, options: DecisionRuntimeOptions = {}) {
  const binding = admission.binding, settings = loadProfileDecisionSettings(task.workspace);
  const runtime = new DecisionRuntime(settings, contextStateRoot(task.workspace), options), eligibility = runtime.eligibility("DL08");
  const selected = binding.operatorOverride ?? binding.baseline;
  const base = { selected: { model: selected.model, effort: selected.effort }, baseline: { model: binding.baseline.model, effort: binding.baseline.effort },
    category: null as string | null, applied: false, reason: "fixed-model", decision: null as Awaited<ReturnType<DecisionRuntime["ask"]>> | null,
    confidence: null as number | null, margin: null as number | null, threshold: { confidence: 0.8, margin: 0.2 },
    scope: resolveDecisionScope(task.workspace, {}, task), coverage: "guarded-child; coordinator activity outside this entry is unknown" };
  if (binding.operatorOverride) return { ...base, reason: "trusted-operator-override" };
  if (eligibility.mode === "off") return base;
  const mapping = settings.modelRouting.providers.claude;
  if (!mapping || !mapping.assignment_classes.includes(binding.assignmentClass)) return { ...base, reason: "assignment-class-ineligible" };
  const categories = Object.entries(mapping.categories);
  if (!categories.length) return { ...base, reason: "no-categories" };
  const qualificationIssues: string[] = [];
  const qualifications = binding.qualifications.flatMap(ref => {
    try {
      const proof = qualifiedProviderPair(ref.directory, ref.requestDigest, binding.guard, binding.roots, binding.requiredTools, binding.jobRoot);
      return proof.resultDigest === ref.resultDigest ? [proof] : [];
    } catch (error) { qualificationIssues.push(error instanceof Error && /^qualification-[a-z-]+$/u.test(error.message) ? error.message : "qualification-unreadable"); return []; }
  });
  const qualified = (pair: { model: string; effort: string }) => qualifications.some(proof => proof.model === pair.model && proof.effort === pair.effort);
  if (!qualified(binding.baseline)) return { ...base, reason: "baseline-unqualified", qualificationIssues };
  const purpose = decisionTaskPurpose(task), identity = { task, bindingDigest: admission.bindingDigest };
  const decision = await runtime.ask({ consumerId: "DL08", entryKind: "provider-submit", eventId: digest(identity), scope: base.scope,
    subject: { digest: digest(task), revision: task.revision, environment: "guarded-provider-submission" },
    evidence: [{ id: "requirement", text: purpose, sourceDigest: digest(purpose), provenance: "supplied", trust: "untrusted" }],
    coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: ["Category confidence is not a probability of successful task completion."] },
    sourcePaths: task.sourcePaths, policyDigest: admission.bindingDigest,
    questions: [{ name: "category", definitionId: "assignment.category/1", consumerId: "DL08", evidenceIds: ["requirement"],
      candidates: categories.map(([id, pair]) => ({ id, description: pair.description })) }] });
  const reading = interpretChoice(decision.answers.category);
  const category = reading.value === "unknown" ? null : reading.value;
  const result = { ...base, decision, category, confidence: reading.confidence, margin: reading.margin, qualificationIssues };
  if (decision.mode === "shadow") return { ...result, reason: "shadow-baseline" };
  if (!decision.delivered) return { ...result, reason: decision.reason };
  if (!category || reading.confidence === null || reading.confidence < base.threshold.confidence || reading.margin === null || reading.margin < base.threshold.margin)
    return { ...result, reason: "category-uncertain" };
  const pair = mapping.categories[category];
  if (!pair || !qualified(pair)) return { ...result, reason: "category-unqualified" };
  if (eligibility.effect !== "route-model") return { ...result, reason: "category-advice-only" };
  return { ...result, selected: { model: pair.model, effort: pair.effort }, applied: true, reason: "operator-category-binding" };
}
