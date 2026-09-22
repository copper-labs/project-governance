import { digest, object } from "./core.ts";
import type { Packs } from "./pack-configuration.ts";
import { buildPlan, type ValidationPlan } from "./planning.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretNoul, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";

const MAX_OPTIONAL = 6, MAX_CATEGORIES = 4;

export interface ValidationAdvice {
  version: 1; kind: "project-governance-validation-advice";
  authority: "advisory only: required checks, execution order, reuse validity and CI publication rules are unchanged";
  mode: string; effect: string; reason: string; delivered: boolean;
  eligibleOptionalChecks: string[];
  recommendedOptionalChecks: Array<{ packId: string; probability: number | null; enforcement: string; observedHistory: null }>;
  coverageConcerns: Array<{ category: string; probability: number | null; paths: string[] }>;
  coverage: DecisionCoverage;
  history: { available: false; note: string };
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "providerCalled" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
  binding: { subjectDigest: string; packsDigest: string; stage: string | null; workspace: string | null };
}

/** Category grouping is code-owned: the model never computes coverage closure or dependency facts. */
function categories(changedPaths: string[]): Array<{ id: string; paths: string[] }> {
  const groups = new Map<string, string[]>();
  for (const path of changedPaths) {
    const id = path.includes("/") ? path.slice(0, path.indexOf("/")) : "(repository root)";
    groups.set(id, [...(groups.get(id) ?? []), path]);
  }
  return [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, MAX_CATEGORIES).map(([id, paths]) => ({ id, paths: paths.slice(0, 16) }));
}

/**
 * Optional-check advice beside the existing plan. Code resolves applicability, required checks and
 * execution order; JEV only ranks eligible optional work and flags a visible catalog gap.
 */
export async function validationAdvice(runtime: DecisionRuntime, packs: Packs, plan: ValidationPlan,
  scope: BudgetScope | null, options: { eventId: string; policyDigest: string; environment: string; revision: string; subjectDigest: string; requirement?: string }): Promise<ValidationAdvice> {
  const eligibility = runtime.eligibility("DL07");
  const stage = plan.stage;
  const selected = new Set(plan.selected_packs);
  const eligible = Object.values(packs)
    .filter(pack => !selected.has(pack.id) && plan.omitted_packs[pack.id] === "not selected by the requested scope" &&
      buildPlan(packs, { stage, mode: "impacted", changedPaths: plan.changed_paths, explicitPackIds: [pack.id] }).status === "ready")
    .map(pack => pack.id).sort().slice(0, MAX_OPTIONAL);
  const groups = categories(plan.changed_paths);
  const base: ValidationAdvice = {
    version: 1, kind: "project-governance-validation-advice",
    authority: "advisory only: required checks, execution order, reuse validity and CI publication rules are unchanged",
    mode: eligibility.mode, effect: eligibility.effect, reason: eligibility.reasons[0] ?? "no-assessable-evidence",
    delivered: false, eligibleOptionalChecks: eligible, recommendedOptionalChecks: [], coverageConcerns: [],
    coverage: { captured: eligible.length + groups.length, omitted: [], truncated: false, unavailable: [],
      limits: ["no per-check duration or failure history is available in this profile; history values are unknown"] },
    history: { available: false, note: "RC1 keeps no history warehouse; missing durations and failure rates stay unknown" },
    decision: null,
    binding: { subjectDigest: options.subjectDigest, packsDigest: digest(packs), stage: plan.stage, workspace: scope?.workspace ?? null },
  };
  if (eligibility.mode === "off" || (!eligible.length && !groups.length)) return base;

  const evidence: EvidenceItem[] = [], questions: QuestionInstance[] = [];
  const selectedQuestions = runtime.settings.questionIds.DL07;
  const scenarioQuestion = selectedQuestions.find(id => id.startsWith("validation.scenario-relevance/"));
  const gapQuestion = selectedQuestions.find(id => id.startsWith("validation.coverage-gap/"));
  const enriched = selectedQuestions.some(id => id.endsWith("/2"));
  const describe = (pack: Packs[string]) => ({ id: pack.id,
    description: typeof pack.description === "string" ? pack.description.slice(0, 1000) : null,
    decision_context: pack.decision_context ?? null });
  const planId = "plan:captured";
  const planSummary = { stage, mode: plan.mode, status: plan.status, changed_paths: plan.changed_paths.slice(0, 64),
    selected_packs: plan.selected_packs, execution_order: plan.execution_order, omitted_packs: plan.omitted_packs,
    ...(enriched ? { requirement: options.requirement ?? null, catalog: Object.values(packs).slice(0, 32).map(describe),
      placement: "unchanged; local and remote execution have the same native proof obligations", platform_capability: "unknown" } : {}) };
  if (enriched) {
    base.coverage.limits.push("Descriptions are authored coverage claims, not a complete dependency or test-coverage graph.");
    if (!options.requirement) base.coverage.unavailable.push("requirement");
    if (Object.keys(packs).length > 32) { base.coverage.truncated = true; base.coverage.limits.push("Catalog descriptions limited to 32 packs; omitted descriptions are unknown."); }
  }
  evidence.push({ id: planId, text: JSON.stringify(planSummary), sourceDigest: digest(planSummary), provenance: "captured", trust: "untrusted" });
  const index = new Map<string, { kind: "check"; packId: string } | { kind: "category"; id: string; paths: string[] }>();
  let counter = 0;
  for (const packId of eligible) {
    if (!scenarioQuestion) continue;
    const pack = packs[packId]!;
    const evidenceId = `check:${packId}`;
    const description = { id: pack.id, enforcement: pack.enforcement, stages: pack.stages, path_globs: pack.path_globs,
      depends_on: pack.depends_on, observed_duration_ms: null, observed_failure_rate: null,
      ...(scenarioQuestion.endsWith("/2") ? describe(pack) : {}) };
    evidence.push({ id: evidenceId, text: JSON.stringify(description), sourceDigest: digest(description), provenance: "captured", trust: "untrusted" });
    const name = `q${++counter}`;
    questions.push({ name, definitionId: scenarioQuestion, consumerId: "DL07", evidenceIds: [evidenceId, planId] });
    index.set(name, { kind: "check", packId });
  }
  for (const group of groups) {
    if (!gapQuestion) continue;
    const evidenceId = `category:${group.id}`;
    evidence.push({ id: evidenceId, text: JSON.stringify(group), sourceDigest: digest(group), provenance: "captured", trust: "untrusted" });
    const name = `q${++counter}`;
    questions.push({ name, definitionId: gapQuestion, consumerId: "DL07", evidenceIds: [evidenceId, planId] });
    index.set(name, { kind: "category", id: group.id, paths: group.paths });
  }
  const outcome = await runtime.ask({ consumerId: "DL07", eventId: `${options.eventId}:DL07`, scope,
    subject: { digest: options.subjectDigest, revision: options.revision, environment: options.environment },
    evidence, coverage: base.coverage, questions, sourcePaths: [...new Set([...plan.changed_paths,
      ...(enriched ? Object.values(packs).slice(0, 32).filter(pack => pack._origin === "target").map(pack => pack._source) : [])])],
    eligibilityDigest: digest({ eligible, selected: plan.selected_packs, order: plan.execution_order }),
    policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, providerCalled: outcome.providerCalled, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  if (!outcome.delivered) return { ...base, mode: outcome.mode, reason: outcome.reason, decision };
  const recommended: ValidationAdvice["recommendedOptionalChecks"] = [];
  const concerns: ValidationAdvice["coverageConcerns"] = [];
  for (const [name, meta] of index) {
    const reading = interpretNoul(outcome.answers[name]);
    if (reading.value !== "positive") continue;
    if (meta.kind === "check") recommended.push({ packId: meta.packId, probability: reading.probability, enforcement: String(packs[meta.packId]!.enforcement), observedHistory: null });
    else concerns.push({ category: meta.id, probability: reading.probability, paths: meta.paths });
  }
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true,
    recommendedOptionalChecks: recommended.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0)),
    coverageConcerns: concerns.sort((a, b) => a.category < b.category ? -1 : a.category > b.category ? 1 : 0), decision };
}

/** Compare only already-run packs with matching source and pack identities; never dispatch extra proof. */
export function validationCounterfactual(advice: ValidationAdvice, intent: unknown, result: unknown) {
  const run = object(intent), receipt = object(result), scope = object(run.scope), plan = object(receipt.plan);
  if (!advice.delivered || !advice.binding.workspace || run.root !== advice.binding.workspace ||
      scope.subject_digest !== advice.binding.subjectDigest || run.packs_digest !== advice.binding.packsDigest ||
      run.id !== receipt.run_id || plan.stage !== advice.binding.stage || !Array.isArray(receipt.results))
    return { status: "unmatched", comparisons: [], savings: null };
  const native = new Map(receipt.results.map(value => { const pack = object(value); return [pack.pack_id, pack.status]; }));
  const recommended = new Set(advice.recommendedOptionalChecks.map(item => item.packId));
  return { status: "compared", comparisons: advice.eligibleOptionalChecks.map(packId => ({ packId,
    recommended: recommended.has(packId), nativeStatus: native.get(packId) ?? "not-observed",
    missedFailure: native.has(packId) ? native.get(packId) === "failed" && !recommended.has(packId) : null })),
    savings: null, meaning: "same-subject observations only; no checks skipped and no causal compute-savings estimate" };
}
