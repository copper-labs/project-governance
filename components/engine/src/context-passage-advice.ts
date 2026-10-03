import { contextExcerpt, contextSourceClusters, contextSpanChoices, type Span as SourceSpan } from "./context-excerpts.ts";
import { procedureUnits, procedureExcerpt, procedureAdvisoryExcerpt } from "./context-procedures.ts";
import { digest } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { prepareDecisionRequest } from "./decision-request-preparation.ts";
import { interpretChoice, interpretNoul, type DecisionAsk, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { contextBudgetScope, contextFamilyScope, readDecisionBudget } from "./decision-budget.ts";
import type { Candidate } from "./decisions.ts";
import type { EvidenceItem, QuestionInstance } from "./decision-schema.ts";

export interface PassageJudgment { sourceDigest: string; excerptDigest: string; probability: number; preferredSpans: SourceSpan[];
  interpretation: "positive" | "uncertain"; role: string | null; roleSource: "jev" | "path" | "unknown"; procedure?: boolean }
export interface PassageUnitOrder { sourceDigest: string; excerptDigest: string; preferredSpans: SourceSpan[];
  basis: "uncertain-score"; kind: "source" | "procedure"; probability: number;
  role?: string | null; roleSource?: "jev" | "path" | "unknown"; policy: "passage-score-3" }
export interface PassageAdvice {
  reason: string; judgments: Record<string, PassageJudgment>; unitOrder: Record<string, PassageUnitOrder>;
  assessed: string[]; omitted: Array<{ path: string; reason: string }>;
  readings: Array<{ path: string; firstLine: number | null; lastLine: number | null; excerptDigest: string;
    probability: number | null; interpretation: string; role: string | null;
    assessedRange: { firstLine: number; lastLine: number } | null; complete: boolean }>;
  procedures: { declaredFiles: number; eligibleUnits: number; preparedUnits: number; assessedUnits: number; assessedBytes: number; selectedFiles: number };
  decisions: DecisionOutcome[]; elapsedMs: number; eligibleUnitCount: number; preparedUnitCount: number; assessedUnitCount: number;
  preparationMs: number; packingMs: number; classificationBytes: number;
}
type PassageInput = {
  purpose: string; scope: BudgetScope | null; subjectDigest: string; revision: string; environment: string;
  invocationId: string; policyDigest: string; deadlineAt: number; signal?: AbortSignal; family?: boolean;
  excerptBytes: number; procedurePaths?: string[]; procedureBytes?: number; sourceSpans?: Record<string, SourceSpan[]>;
};
type PreparedPassage = { candidate: Candidate; item: EvidenceItem; span: SourceSpan | null; excerptDigest: string; procedure: boolean; complete: boolean };
/** Spend the bounded candidate allocation across files before taking deeper units. */
function preparePassages(runtime: DecisionRuntime, candidates: Candidate[], input: PassageInput, remainingBytes: number, classificationBytes: number) {
  const omitted: PassageAdvice["omitted"] = [], prepared: PreparedPassage[] = [];
  let eligibleUnitCount = 0, procedureUnitCount = 0;
  const queues: Array<{ candidate: Candidate; spans: Array<SourceSpan | null>; procedure: boolean }> = [];
  for (const candidate of candidates) {
    if (!matchesPackPath(candidate.id, runtime.settings.legacy.allowedSourcePaths ?? [])) {
      omitted.push({ path: candidate.id, reason: "source-scope-disabled" }); continue;
    }
    if (input.procedurePaths?.includes(candidate.id)) {
      const units = procedureUnits(candidate); procedureUnitCount += units.length; eligibleUnitCount += units.length;
      const permitted = units.filter(span => {
        if (procedureExcerpt(candidate, [span], input.procedureBytes ?? input.excerptBytes)) return true;
        omitted.push({ path: candidate.id, reason: "procedure-unit-too-large" }); return false;
      });
      queues.push({ candidate, spans: permitted, procedure: true }); continue;
    }
    const spans = input.sourceSpans?.[candidate.id] ?? [];
    // A small file is already one bounded unit. Keeping it intact preserves fixtures and helpers
    // and avoids paying for several questions about fragments of the same behavior.
    if (Buffer.byteLength(candidate.excerpt) <= Math.min(input.excerptBytes, classificationBytes)) {
      eligibleUnitCount++; queues.push({ candidate, spans: [null], procedure: false }); continue;
    }
    // Names order dispatch; they cannot decide whether JEV sees the body of a captured unit.
    // Oversized source units remain eligible as explicitly partial excerpts.
    const eligible = contextSpanChoices(candidate, input.purpose, contextSourceClusters(candidate, spans), true);
    eligibleUnitCount += Math.max(1, eligible.length);
    queues.push({ candidate, spans: eligible.length ? eligible.map(item => item.span) : [null], procedure: false });
  }
  let preparedBytes = 0;
  const seen = new Map<string, number>();
  const procedureQueues = queues.filter(queue => queue.procedure), sourceQueues = queues.filter(queue => !queue.procedure);
  function* sequence(items: typeof queues) {
    for (let round = 0; items.some(queue => queue.spans.length > round); round++) for (const queue of items)
      if (queue.spans.length > round) yield { candidate: queue.candidate, span: queue.spans[round]!, procedure: queue.procedure };
  }
  const procedures = sequence(procedureQueues), sources = sequence(sourceQueues);
  function* alternating() {
    while (true) {
      const procedure = procedures.next(), source = sources.next();
      if (procedure.done && source.done) break;
      if (!procedure.done) yield procedure.value;
      if (!source.done) yield source.value;
    }
  }
  for (const { candidate, span, procedure } of alternating()) {
    if (input.signal?.aborted || performance.now() >= input.deadlineAt) break;
    seen.set(candidate.id, (seen.get(candidate.id) ?? 0) + 1);
    const spans = input.sourceSpans?.[candidate.id] ?? [];
    const excerpt = procedure && span ? procedureExcerpt(candidate, [span], input.procedureBytes ?? input.excerptBytes)
      : contextExcerpt(candidate, input.purpose, classificationBytes, spans, span ? [span] : []);
    if (!excerpt || !excerpt.excerpt.trim() || Buffer.byteLength(excerpt.excerpt) > (procedure ? input.procedureBytes ?? input.excerptBytes : classificationBytes)) {
      omitted.push({ path: candidate.id, reason: "excerpt-unrepresentable" }); continue;
    }
    const unit = excerpt.sourceUnits?.map(part => ({ kind: part.kind, name: part.name, complete: part.complete })) ?? [];
    const item = { candidate, span, procedure, complete: excerpt.sourceUnits?.every(unit => unit.complete) ?? !(excerpt.sourceRange || excerpt.sourceRanges), excerptDigest: digest(excerpt.excerpt), item: { id: `passage-${prepared.length}`, sourceDigest: candidate.sourceDigest,
      text: JSON.stringify({ path: candidate.id, ...(procedure ? { ancestry: (span as { ancestry?: string[] })?.ancestry ?? [], kind: "procedure" } : {}), sourceUnits: unit, passage: excerpt.excerpt }), provenance: "captured", trust: "untrusted",
      ...(excerpt.sourceRange ? { range: { firstLine: excerpt.sourceRange.firstLine, lastLine: excerpt.sourceRange.lastLine,
        totalLines: excerpt.sourceRange.totalLines } } : {}) } } satisfies PreparedPassage;
    const bytes = Buffer.byteLength(item.item.text);
    if (preparedBytes + bytes > remainingBytes) { omitted.push({ path: candidate.id, reason: "passage-budget" }); continue; }
    preparedBytes += bytes; prepared.push(item);
  }
  for (const queue of queues) if ((seen.get(queue.candidate.id) ?? 0) < queue.spans.length)
    omitted.push({ path: queue.candidate.id, reason: "deadline-or-cancelled" });
  return { prepared, omitted, eligibleUnitCount, procedureUnitCount };
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
  const unitOrder: PassageAdvice["unitOrder"] = {};
  const omitted: PassageAdvice["omitted"] = [], readings: PassageAdvice["readings"] = [], decisions: DecisionOutcome[] = [];
  let prepared: PreparedPassage[] = [];
  let preparationMs = 0, packingMs = 0;
  const classificationBytes = Math.max(128, Math.min(65536, runtime.settings.legacy.evidenceBytes - Buffer.byteLength(input.purpose) - 1024));
  const result = (reason: string): PassageAdvice => ({ reason, judgments, unitOrder, assessed, omitted, readings, decisions,
    procedures: { declaredFiles: input.procedurePaths?.length ?? 0, eligibleUnits: procedureUnitCount,
      preparedUnits: prepared.filter(item => item.procedure).length,
      assessedUnits: readings.filter(item => input.procedurePaths?.includes(item.path) && item.probability !== null).length,
      assessedBytes: prepared.filter(item => item.procedure && readings.some(reading => reading.path === item.candidate.id && reading.excerptDigest === item.excerptDigest && reading.probability !== null)).reduce((sum, item) => sum + Buffer.byteLength(JSON.parse(item.item.text).passage), 0),
      selectedFiles: Object.values(judgments).filter(item => item.procedure).length },
    eligibleUnitCount, preparedUnitCount: prepared.length, assessedUnitCount: readings.filter(item => item.probability !== null).length,
    preparationMs, packingMs, classificationBytes,
    elapsedMs: performance.now() - started });
  let eligibleUnitCount = 0, procedureUnitCount = 0;
  if (!["context.passage-evidence/1", "context.passage-role/1"].every(id => runtime.settings.questionIds.DL03.includes(id))) return result("passage-questions-disabled");
  if (!input.scope || runtime.eligibility("DL03").providerUse !== "eligible") return result("provider-unavailable");
  if (performance.now() >= input.deadlineAt || input.signal?.aborted) return result("deadline-or-cancelled");
  const purpose: EvidenceItem = { id: "purpose", text: input.purpose, sourceDigest: digest(input.purpose), provenance: "supplied", trust: "untrusted" };
  const spent = readDecisionBudget(runtime.stateRoot, input.family
    ? contextFamilyScope(input.scope.workspace, input.invocationId) : contextBudgetScope(input.scope, input.invocationId));
  const remainingBytes = Math.max(0, runtime.settings.contextBudget.maxRequestBytes - (spent?.bytes ?? 0));
  const remainingCalls = Math.max(0, runtime.settings.contextBudget.maxCalls - (spent?.calls ?? 0));
  const preparationStarted = performance.now();
  const preparation = preparePassages(runtime, candidates, input, remainingBytes, classificationBytes);
  preparationMs = performance.now() - preparationStarted;
  prepared = preparation.prepared; omitted.push(...preparation.omitted); eligibleUnitCount = preparation.eligibleUnitCount; procedureUnitCount = preparation.procedureUnitCount;
  if (!prepared.length) return result(omitted.some(item => item.reason === "passage-budget") ? "passage-budget" : "no-permitted-passages");
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
      evidenceLayout: "compact-v1", evidence, questions, sourcePaths: [...new Set(items.map(item => item.candidate.id))],
      budgetPartition: "context-selection", budgetInvocationId: input.invocationId, ...(input.family ? { budgetFamily: true } : {}),
      coverage: { captured: items.length, omitted: [], unavailable: [], truncated: items.length !== prepared.length,
        limits: ["bounded-captured-passages", `source-classification-${classificationBytes}-bytes`, `delivery-excerpt-${input.excerptBytes}-bytes`] },
      policyDigest: input.policyDigest, deadlineAt: input.deadlineAt, ...(input.signal ? { signal: input.signal } : {}) };
  };
  const size = (items: PreparedPassage[]) => {
    const request = prepareDecisionRequest(makeAsk(items), runtime.settings, ["DL03"], "packing", runtime.settings.contextBudget);
    return request.ok ? request.requestBytes : null;
  };
  const packingStarted = performance.now();
  const batches = fitPassageBatches(prepared, size, remainingBytes, remainingCalls, omitted);
  packingMs = performance.now() - packingStarted;
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
  const uncertain = new Map<string, Array<{ span: SourceSpan | null; probability: number; role: string | null; roleSource: "jev" | "path" | "unknown" }>>();
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
      readings.push({ path: item.candidate.id, firstLine: item.span?.start ?? item.item.range?.firstLine ?? null, lastLine: item.span?.end ?? item.item.range?.lastLine ?? null,
        excerptDigest: item.excerptDigest,
        assessedRange: item.item.range ? { firstLine: item.item.range.firstLine, lastLine: item.item.range.lastLine } : null,
        complete: item.complete,
        probability: direct.probability,
        interpretation: outcome.delivered ? direct.value : "unavailable", role: role?.value ?? literalRole });
      if (outcome.delivered && direct.probability !== null && !assessed.includes(item.candidate.id)) assessed.push(item.candidate.id);
      if (outcome.delivered && direct.value === "uncertain" && direct.probability !== null && (item.span || Buffer.byteLength(item.candidate.excerpt) <= input.excerptBytes)) {
        const group = uncertain.get(item.candidate.id) ?? [];
        group.push({ span: item.span, probability: direct.probability, role: selectedRole,
          roleSource: literalRole ? "path" : supportedRole ? "jev" : "unknown" }); uncertain.set(item.candidate.id, group);
      }
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
    if (uncertain.has(candidate.id)) {
      // Advisory order retains uncertainty. It grants no pin, larger allowance or positive status.
      // Source order breaks ties without dependence on batch order.
      const ordered = [...uncertain.get(candidate.id)!, ...(group ?? []).flatMap(item => item.span
        ? [{ span: item.span, probability: item.probability, role: item.role, roleSource: item.roleSource }] : [])]
        .sort((a, b) => b.probability - a.probability || (a.span?.start ?? 0) - (b.span?.start ?? 0) || (a.span?.end ?? 0) - (b.span?.end ?? 0));
      const procedure = input.procedurePaths?.includes(candidate.id) ?? false;
      const spans: SourceSpan[] = [];
      for (const item of ordered) {
        const span = item.span;
        if (!span) continue;
        if (spans.length >= 4) break;
        if (spans.some(other => !(span.end < other.start || span.start > other.end))) continue;
        spans.push(span);
      }
      const whole = !procedure && ordered.some(item => item.span === null) && Buffer.byteLength(candidate.excerpt) <= input.excerptBytes;
      const excerpt = whole ? candidate : !spans.length ? null : procedure ? procedureAdvisoryExcerpt(candidate, input.purpose, spans, input.excerptBytes)
        : contextExcerpt(candidate, input.purpose, input.excerptBytes, input.sourceSpans?.[candidate.id], spans);
      const anchor = group?.slice().sort((a, b) => b.probability - a.probability || (a.span?.start ?? 0) - (b.span?.start ?? 0))[0];
      // Mixed advice must retain its confirmed anchor before the file can receive positive treatment.
      if (excerpt && (!anchor?.span || excerpt.sourceUnits?.some(unit => unit.complete && unit.firstLine <= anchor.span!.start && unit.lastLine >= anchor.span!.end)))
        unitOrder[candidate.id] = { sourceDigest: candidate.sourceDigest, excerptDigest: digest(excerpt.excerpt),
          preferredSpans: spans, basis: "uncertain-score", kind: procedure ? "procedure" : "source", probability: ordered[0]!.probability,
          role: ordered[0]!.role, roleSource: ordered[0]!.roleSource, policy: "passage-score-3" };
    }
    if (!group?.length) continue;
    // Source order resolves equal scores without depending on dispatch composition.
    group.sort((left, right) => right.probability - left.probability || (left.span?.start ?? 0) - (right.span?.start ?? 0));
    const best = group[0]!;
    const chosen = [best];
    const procedure = input.procedurePaths?.includes(candidate.id) ?? false;
    for (const item of group.slice(1)) {
      if (chosen.length >= 4) break;
      if (item.span && chosen.every(other => other.span &&
        (item.span!.end < other.span.start || item.span!.start > other.span.end))) {
        if (procedure && !procedureExcerpt(candidate, [...chosen, item].flatMap(value => value.span ? [value.span] : []), input.procedureBytes ?? input.excerptBytes))
          omitted.push({ path: candidate.id, reason: "procedure-delivery-budget" });
        else chosen.push(item);
      }
    }
    const preferredSpans = chosen.flatMap(item => item.span ? [item.span] : []);
    const excerpt = procedure ? procedureExcerpt(candidate, preferredSpans, input.procedureBytes ?? input.excerptBytes)
      : contextExcerpt(candidate, input.purpose, input.excerptBytes, input.sourceSpans?.[candidate.id], preferredSpans);
    if (!excerpt) { omitted.push({ path: candidate.id, reason: "procedure-delivery-budget" }); continue; }
    judgments[candidate.id] = { sourceDigest: candidate.sourceDigest, excerptDigest: digest(excerpt.excerpt),
      probability: best.probability, interpretation: best.interpretation, role: best.role, roleSource: best.roleSource, preferredSpans, ...(procedure ? { procedure: true } : {}) };
  }
  return result(input.signal?.aborted ? "cancelled" : settled.some(item => item.status === "rejected") ? "selection-unavailable" :
    decisions.some(item => item.delivered) ? "answered" : decisions.at(-1)?.reason ?? "deadline");
}
