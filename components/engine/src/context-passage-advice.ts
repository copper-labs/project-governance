import { contextExcerpt, contextSourceClusters, contextSpanChoices, type Span as SourceSpan } from "./context-excerpts.ts";
import { digest } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { prepareDecisionRequest } from "./decision-request-preparation.ts";
import { interpretChoice, interpretNoul, type DecisionAsk, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { contextBudgetScope, contextFamilyScope, readDecisionBudget } from "./decision-budget.ts";
import type { Candidate } from "./decisions.ts";
import type { EvidenceItem, QuestionInstance } from "./decision-schema.ts";

export interface PassageJudgment { sourceDigest: string; excerptDigest: string; probability: number; preferredSpans: SourceSpan[];
  interpretation: "positive" | "uncertain"; role: string | null; roleSource: "jev" | "path" | "unknown" }
export interface PassageAdvice {
  reason: string; judgments: Record<string, PassageJudgment>; assessed: string[]; omitted: Array<{ path: string; reason: string }>;
  readings: Array<{ path: string; firstLine: number | null; lastLine: number | null; excerptDigest: string;
    probability: number | null; interpretation: string; role: string | null }>;
  decisions: DecisionOutcome[]; elapsedMs: number; eligibleUnitCount: number; preparedUnitCount: number; assessedUnitCount: number;
}
type PassageInput = {
  purpose: string; scope: BudgetScope | null; subjectDigest: string; revision: string; environment: string;
  invocationId: string; policyDigest: string; deadlineAt: number; signal?: AbortSignal; family?: boolean;
  excerptBytes: number; sourceSpans?: Record<string, SourceSpan[]>;
};
type PreparedPassage = { candidate: Candidate; item: EvidenceItem; span: SourceSpan | null; excerptDigest: string };

/** Spend the bounded candidate allocation across files before taking deeper units. */
function preparePassages(runtime: DecisionRuntime, candidates: Candidate[], input: PassageInput) {
  const omitted: PassageAdvice["omitted"] = [], prepared: PreparedPassage[] = [];
  let eligibleUnitCount = 0;
  const queues: Array<{ candidate: Candidate; spans: Array<SourceSpan | null> }> = [];
  for (const candidate of candidates) {
    if (!matchesPackPath(candidate.id, runtime.settings.legacy.allowedSourcePaths ?? [])) {
      omitted.push({ path: candidate.id, reason: "source-scope-disabled" }); continue;
    }
    const spans = input.sourceSpans?.[candidate.id] ?? [];
    const eligible = contextSpanChoices(candidate, input.purpose, contextSourceClusters(candidate, spans))
      .filter(item => item.bytes <= 2 * input.excerptBytes);
    eligibleUnitCount += Math.max(1, eligible.length);
    queues.push({ candidate, spans: eligible.length ? eligible.map(item => item.span) : [null] });
  }
  const ordered: Array<{ candidate: Candidate; span: SourceSpan | null }> = [];
  const seen = new Set<string>();
  const include = (queue: typeof queues[number], index: number) => {
    const span = queue.spans[index];
    if (span === undefined || ordered.length >= 64) return;
    const key = `${queue.candidate.id}:${index}`;
    if (!seen.has(key)) { ordered.push({ candidate: queue.candidate, span }); seen.add(key); }
  };
  for (let round = 0; round < 2; round++) for (const queue of queues.slice(0, 4)) include(queue, round);
  for (let round = 0; ordered.length < 64 && queues.some(queue => queue.spans.length > round); round++)
    for (const queue of queues) include(queue, round);
  for (const queue of queues) if (queue.spans.length > [...seen].filter(key => key.startsWith(`${queue.candidate.id}:`)).length)
    omitted.push({ path: queue.candidate.id, reason: "unit-evaluation-cap" });
  for (const { candidate, span } of ordered) {
    const spans = input.sourceSpans?.[candidate.id] ?? [];
    const excerpt = contextExcerpt(candidate, input.purpose, input.excerptBytes, span ? [span] : spans);
    if (!excerpt.excerpt.trim() || Buffer.byteLength(excerpt.excerpt) > input.excerptBytes) {
      omitted.push({ path: candidate.id, reason: "excerpt-unrepresentable" }); continue;
    }
    const unit = excerpt.sourceUnits?.map(part => ({ kind: part.kind, name: part.name, complete: part.complete })) ?? [];
    prepared.push({ candidate, span, excerptDigest: digest(excerpt.excerpt), item: { id: `passage-${prepared.length}`, sourceDigest: candidate.sourceDigest,
      text: JSON.stringify({ path: candidate.id, sourceUnits: unit, passage: excerpt.excerpt }), provenance: "captured", trust: "untrusted",
      ...(excerpt.sourceRange ? { range: { firstLine: excerpt.sourceRange.firstLine, lastLine: excerpt.sourceRange.lastLine,
        totalLines: excerpt.sourceRange.totalLines } } : {}) } });
  }
  return { prepared, omitted, eligibleUnitCount };
}

/** Fit the actual serialized payload before runtime admission and spending. */
function fitPassageBatches(prepared: PreparedPassage[], size: (items: PreparedPassage[]) => number | null,
  remainingBytes: number, remainingCalls: number, omitted: PassageAdvice["omitted"]) {
  const batches: PreparedPassage[][] = [];
  let batch: PreparedPassage[] = [], claimedBytes = 0;
  for (const item of prepared) {
    const nextSize = size([...batch, item]);
    if (batch.length && (nextSize === null || claimedBytes + nextSize > remainingBytes)) {
      claimedBytes += size(batch)!; batches.push(batch); batch = [];
    }
    const singleSize = size([...batch, item]);
    if (batches.length + 1 > remainingCalls || singleSize === null || claimedBytes + singleSize > remainingBytes)
      omitted.push({ path: item.candidate.id, reason: "passage-budget" });
    else batch.push(item);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/** A second, opt-in question group judges the actual captured passages, not file descriptions. */
export async function selectContextPassages(runtime: DecisionRuntime, candidates: Candidate[], input: PassageInput): Promise<PassageAdvice> {
  const started = performance.now(), judgments: PassageAdvice["judgments"] = {}, assessed: string[] = [];
  const omitted: PassageAdvice["omitted"] = [], readings: PassageAdvice["readings"] = [], decisions: DecisionOutcome[] = [];
  let prepared: PreparedPassage[] = [];
  const result = (reason: string): PassageAdvice => ({ reason, judgments, assessed, omitted, readings, decisions,
    eligibleUnitCount, preparedUnitCount: prepared.length, assessedUnitCount: readings.filter(item => item.probability !== null).length,
    elapsedMs: performance.now() - started });
  let eligibleUnitCount = 0;
  if (!["context.passage-evidence/1", "context.passage-role/1"].every(id => runtime.settings.questionIds.DL03.includes(id))) return result("passage-questions-disabled");
  if (!input.scope || runtime.eligibility("DL03").providerUse !== "eligible") return result("provider-unavailable");
  if (performance.now() >= input.deadlineAt || input.signal?.aborted) return result("deadline-or-cancelled");
  const purpose: EvidenceItem = { id: "purpose", text: input.purpose, sourceDigest: digest(input.purpose), provenance: "supplied", trust: "untrusted" };
  const preparation = preparePassages(runtime, candidates, input);
  prepared = preparation.prepared; omitted.push(...preparation.omitted); eligibleUnitCount = preparation.eligibleUnitCount;
  if (!prepared.length) return result("no-permitted-passages");
  const roles = ["implementation", "test", "documentation", "operations", "other"].map(id => ({ id, description: id }));
  const pathRole = (path: string) => /(?:^|\/)(?:tests?\/|[^/]+\.(?:test|spec)\.|[^/]+Tests?\.|test_[^/]+\.py$)/iu.test(path) ? "test"
    : /\.mdx?$/iu.test(path) ? "documentation" : /\.(?:[cm]?[jt]sx?|swift|kt|kts|py|go|rs|java)$/iu.test(path) ? "implementation" : null;
  const makeAsk = (items: PreparedPassage[]): DecisionAsk => {
    const evidence = [purpose, ...items.map(item => item.item)];
    const questions: QuestionInstance[] = items.flatMap(item => [
      { name: `evidence-${item.item.id}`, consumerId: "DL03" as const, definitionId: "context.passage-evidence/1", evidenceIds: ["purpose", item.item.id] },
      ...(pathRole(item.candidate.id) ? [] : [{ name: `role-${item.item.id}`, consumerId: "DL03" as const,
        definitionId: "context.passage-role/1", evidenceIds: ["purpose", item.item.id], candidates: roles }]),
    ]);
    const signature = digest({ purpose: input.purpose, evidence, questions, revision: input.revision });
    return { consumerId: "DL03", eventId: digest({ invocation: input.invocationId, signature }), scope: input.scope,
      subject: { digest: signature, revision: input.revision, environment: input.environment },
      evidenceLayout: "shared-v1", evidence, questions, sourcePaths: [...new Set(items.map(item => item.candidate.id))],
      budgetPartition: "context-selection", budgetInvocationId: input.invocationId, ...(input.family ? { budgetFamily: true } : {}),
      coverage: { captured: items.length, omitted: [], unavailable: [], truncated: items.length !== prepared.length,
        limits: ["bounded-captured-passages", `excerpt-${input.excerptBytes}-bytes`] },
      policyDigest: input.policyDigest, deadlineAt: input.deadlineAt, ...(input.signal ? { signal: input.signal } : {}) };
  };
  const size = (items: PreparedPassage[]) => {
    const request = prepareDecisionRequest(makeAsk(items), runtime.settings, ["DL03"], "packing");
    return request.ok ? request.requestBytes : null;
  };
  const spent = readDecisionBudget(runtime.stateRoot, input.family
    ? contextFamilyScope(input.scope.workspace, input.invocationId) : contextBudgetScope(input.scope, input.invocationId));
  const remainingBytes = Math.max(0, runtime.settings.budget.maxRequestBytes - (spent?.bytes ?? 0));
  const remainingCalls = Math.max(0, runtime.settings.budget.maxCalls - (spent?.calls ?? 0));
  const batches = fitPassageBatches(prepared, size, remainingBytes, remainingCalls, omitted);
  if (!batches.length) return result("passage-budget");
  let next = 0;
  const outcomes: Array<DecisionOutcome | undefined> = new Array(batches.length);
  const worker = async () => {
    while (next < batches.length && !input.signal?.aborted && performance.now() < input.deadlineAt) {
      const index = next++;
      outcomes[index] = await runtime.ask(makeAsk(batches[index]!));
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.min(4, batches.length) }, worker));
  const variants = new Map<string, Array<{ span: SourceSpan | null; probability: number; interpretation: "positive" | "uncertain";
    role: string | null; roleSource: "jev" | "path" | "unknown" }>>();
  for (const [index, items] of batches.entries()) {
    const outcome = outcomes[index];
    if (!outcome) { for (const item of items) omitted.push({ path: item.candidate.id, reason: "deadline-or-cancelled" }); continue; }
    decisions.push(outcome);
    for (const item of items) {
      const direct = interpretNoul(outcome.answers[`evidence-${item.item.id}`]);
      const role = pathRole(item.candidate.id) ? null : interpretChoice(outcome.answers[`role-${item.item.id}`]);
      const supportedRole = role && role.value !== "unknown" && role.confidence !== null && role.confidence >= 0.5 ? role.value : null;
      const literalRole = pathRole(item.candidate.id);
      const selectedRole = literalRole ?? supportedRole;
      readings.push({ path: item.candidate.id, firstLine: item.item.range?.firstLine ?? null, lastLine: item.item.range?.lastLine ?? null,
        excerptDigest: item.excerptDigest,
        probability: direct.probability,
        interpretation: outcome.delivered ? direct.value : "unavailable", role: role?.value ?? literalRole });
      if (outcome.delivered && direct.probability !== null && !assessed.includes(item.candidate.id)) assessed.push(item.candidate.id);
      if (outcome.delivered && direct.value === "positive" && direct.probability !== null) {
        const group = variants.get(item.candidate.id) ?? [];
        group.push({ span: item.span, probability: direct.probability!, interpretation: direct.value,
          role: selectedRole, roleSource: literalRole ? "path" : supportedRole ? "jev" : "unknown" });
        variants.set(item.candidate.id, group);
      }
    }
  }
  for (const candidate of candidates) {
    const group = variants.get(candidate.id);
    if (!group?.length) continue;
    // Keep prepared relevance order. Nearby probability estimates are not a second ranking signal.
    const best = group[0]!;
    const chosen = [best];
    for (const item of group.slice(1)) {
      if (chosen.length >= 4) break;
      if (item.span && chosen.every(other => other.span &&
        (item.span!.end < other.span.start || item.span!.start > other.span.end))) chosen.push(item);
    }
    const preferredSpans = chosen.flatMap(item => item.span ? [item.span] : []);
    const excerpt = contextExcerpt(candidate, input.purpose, input.excerptBytes, input.sourceSpans?.[candidate.id], preferredSpans);
    judgments[candidate.id] = { sourceDigest: candidate.sourceDigest, excerptDigest: digest(excerpt.excerpt),
      probability: best.probability, interpretation: best.interpretation, role: best.role, roleSource: best.roleSource, preferredSpans };
  }
  return result(input.signal?.aborted ? "cancelled" : settled.some(item => item.status === "rejected") ? "selection-unavailable" :
    decisions.some(item => item.delivered) ? "answered" : decisions.at(-1)?.reason ?? "deadline");
}
