import { createHash } from "node:crypto";
import { digest, object, text } from "./core.ts";
import type { ChangeScope, ValidationSubject } from "./change-subject.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretNoul, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";

const MAX_TEST_HUNKS = 4, MAX_DIFF_HUNKS = 4, MAX_RULES = 2, MAX_HUNK_BYTES = 4000;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.py$|Test\.kt$/u;

export interface ReviewRule { id: string; title: string; rationale: string; examples: string[] }
export interface ReviewHunk { id: string; path: string; kind: "test" | "source"; status: string; diff: string; diffDigest: string; bytes: number }
export interface ReviewCapture {
  subjectDigest: string; baseRef: string | null; purpose: string; purposeSource: string;
  hunks: ReviewHunk[]; rules: ReviewRule[]; coverage: DecisionCoverage; capturePaths: string[];
}

/** Supplied rules are reviewed data; supplied rule text is evidence, not executable policy. */
export function parseReviewRules(raw: unknown): ReviewRule[] {
  const document = object(raw, "review rules");
  if (document["version"] !== 1 || !Array.isArray(document["rules"])) throw new Error("Unsupported review rule document");
  if (document["rules"].length > 32) throw new Error("Review rule document exceeds its bound");
  return document["rules"].map(value => {
    const rule = object(value, "review rule");
    for (const key of Object.keys(rule)) if (!["id", "title", "rationale", "examples"].includes(key)) throw new Error("Unknown review rule field");
    const examples = rule["examples"] ?? [];
    if (!Array.isArray(examples) || examples.length > 8) throw new Error("Review rule examples must be a bounded list");
    return { id: text(rule["id"], "review rule id", 64), title: text(rule["title"], "review rule title", 200),
      rationale: text(rule["rationale"], "review rule rationale", 2000), examples: examples.map(item => text(item, "review rule example", 500)) };
  });
}

/**
 * One exact-diff capture shared by DL01 and DL02. Sharing preparation does not combine the features:
 * their questions, coverage, modes and findings stay separate.
 */
export function captureReviewEvidence(subject: ValidationSubject, scope: ChangeScope,
  options: { purpose: string; purposeSource: string; rules?: ReviewRule[]; maximumBytes?: number }): ReviewCapture {
  const omitted: string[] = [], unavailable: string[] = [], limits: string[] = [];
  const hunks: ReviewHunk[] = [];
  let truncated = false;
  const candidates = scope.records.filter(record => record.status !== "deleted");
  const rules = (options.rules ?? []).slice(0, MAX_RULES);
  const ruleBytes = rules.reduce((bytes, rule) => bytes + Buffer.byteLength(`${rule.title}\n${rule.rationale}\n${rule.examples.join("\n")}`), 0);
  const available = Math.max(0, (options.maximumBytes ?? 8192) - ruleBytes - Buffer.byteLength(options.purpose));
  const hunkLimit = Math.min(MAX_HUNK_BYTES, Math.floor(available / Math.max(1, Math.min(candidates.length, MAX_TEST_HUNKS + MAX_DIFF_HUNKS))));
  if (hunkLimit < 128) limits.push("evidence allowance cannot fit the supplied purpose, rules and a useful diff excerpt");
  for (const record of candidates) {
    if (!/\.[cm]?[jt]sx?$/u.test(record.path)) {
      omitted.push(record.path); limits.push(`${record.path}: first-RC review supports JS/TS source and tests only`); continue;
    }
    if (hunkLimit < 128) { omitted.push(record.path); truncated = true; continue; }
    const kind: "test" | "source" = TEST_PATH.test(record.path) ? "test" : "source";
    const taken = hunks.filter(hunk => hunk.kind === kind).length;
    if (taken >= (kind === "test" ? MAX_TEST_HUNKS : MAX_DIFF_HUNKS)) { omitted.push(record.path); truncated = true; continue; }
    let diff: string;
    try { diff = subject.hunks(record.path); }
    catch { unavailable.push(record.path); continue; }
    if (!diff.trim()) { unavailable.push(record.path); continue; }
    if (Buffer.byteLength(diff) > hunkLimit) {
      // Slice bytes, not UTF-16 code units; back off an incomplete UTF-8 character.
      const encoded = Buffer.from(diff);
      let end = hunkLimit;
      while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end--;
      diff = encoded.subarray(0, end).toString("utf8");
      truncated = true; limits.push(`${record.path}: diff truncated to ${hunkLimit} bytes`);
    }
    hunks.push({ id: `hunk:${record.path}`, path: record.path, kind, status: record.status, diff,
      diffDigest: `sha256:${createHash("sha256").update(diff).digest("hex")}`, bytes: Buffer.byteLength(diff) });
  }
  if ((options.rules ?? []).length > MAX_RULES) limits.push(`only the first ${MAX_RULES} supplied rules are assessed per request`);
  limits.push("Test runtime, fixtures and dependency behavior are not executed or independently established by diff advice.");
  if (options.purposeSource === "unavailable") limits.push("Task-specific intent is unavailable; do not infer a requirement from the diff.");
  if (!rules.length) limits.push("no review rules supplied: DL02 assesses task relevance only");
  if (!hunks.some(hunk => hunk.kind === "test")) limits.push("no changed test file in the captured subject: DL01 has no assessable evidence");
  return { subjectDigest: scope.subject_digest ?? "none", baseRef: scope.base_ref, purpose: options.purpose,
    purposeSource: options.purposeSource, hunks, rules, capturePaths: hunks.map(hunk => hunk.path),
    coverage: { captured: hunks.length, omitted, truncated, unavailable, limits } };
}

export interface ReviewFinding {
  consumerId: "DL01" | "DL02"; questionId: string; ruleId: string | null; path: string;
  interpretation: "positive" | "negative" | "uncertain" | "unknown"; probability: number | null;
  message: string; evidence: { hunkId: string; diffDigest: string };
}
export interface ConsumerAdvice {
  consumerId: "DL01" | "DL02"; mode: string; effect: string; reason: string; delivered: boolean;
  assessed: number; findings: ReviewFinding[]; coverageLimits: string[]; summary: string;
}
export interface ReviewAdvice {
  version: 1; kind: "project-governance-review-advice";
  authority: "advisory only: deterministic findings, checker results, required proof and exit status are unchanged";
  subjectDigest: string; purpose: string; purposeSource: string;
  batched: boolean; coverage: DecisionCoverage;
  consumers: ConsumerAdvice[];
  decisions: Array<Pick<DecisionOutcome, "consumerId" | "consumers" | "requestId" | "receiptId" | "mode" | "effect" | "method" | "reason" | "delivered" | "model" | "usage" | "usageAllocation" | "latencyMs" | "budget" | "scopeState">>;
}

const MESSAGES: Record<string, (path: string, rule: ReviewRule | null) => string> = {
  "test.assertion-support/1": path => `Changed test in ${path} may not fail if the described behaviour regresses.`,
  "test.mocked-behavior/1": path => `Changed test in ${path} may assert only behaviour configured by its own mock.`,
  "test.expectation-weakened/1": path => `Changed expectation in ${path} may have been weakened rather than corrected.`,
  "diff.rule-concern/1": (path, rule) => `${path} may exhibit the supplied rule concern: ${rule?.title ?? "unnamed rule"}.`,
  "diff.task-relevance/1": path => `${path} may be unrelated to the assigned task.`,
};

function receiptOf(outcome: DecisionOutcome) {
  return { consumerId: outcome.consumerId, consumers: outcome.consumers, requestId: outcome.requestId, receiptId: outcome.receiptId,
    mode: outcome.mode, effect: outcome.effect, method: outcome.method, reason: outcome.reason, delivered: outcome.delivered,
    model: outcome.model, usage: outcome.usage, usageAllocation: outcome.usageAllocation, latencyMs: outcome.latencyMs,
    budget: outcome.budget, scopeState: outcome.scopeState };
}

interface Prepared { evidence: EvidenceItem[]; questions: QuestionInstance[]; index: Map<string, { consumerId: "DL01" | "DL02"; definitionId: string; path: string; hunkId: string; diffDigest: string; rule: ReviewRule | null }> }

function prepare(capture: ReviewCapture, consumers: Array<"DL01" | "DL02">): Prepared {
  const evidence: EvidenceItem[] = [], questions: QuestionInstance[] = [];
  const index: Prepared["index"] = new Map();
  const used = new Set<string>();
  const addEvidence = (item: EvidenceItem) => { if (!used.has(item.id)) { used.add(item.id); evidence.push(item); } };
  const purposeId = "task:purpose";
  addEvidence({ id: purposeId, text: capture.purpose, sourceDigest: digest(capture.purpose), provenance: "supplied", trust: "untrusted" });
  let counter = 0;
  const name = () => `q${++counter}`;
  for (const hunk of capture.hunks) {
    addEvidence({ id: hunk.id, text: hunk.diff, sourceDigest: hunk.diffDigest, provenance: "captured", trust: "untrusted" });
    if (consumers.includes("DL01") && hunk.kind === "test") {
      for (const definitionId of ["test.assertion-support/1", "test.mocked-behavior/1", "test.expectation-weakened/1"]) {
        const key = name();
        questions.push({ name: key, definitionId, consumerId: "DL01", evidenceIds: [hunk.id, purposeId] });
        index.set(key, { consumerId: "DL01", definitionId, path: hunk.path, hunkId: hunk.id, diffDigest: hunk.diffDigest, rule: null });
      }
    }
    if (consumers.includes("DL02")) {
      const relevance = name();
      questions.push({ name: relevance, definitionId: "diff.task-relevance/1", consumerId: "DL02", evidenceIds: [hunk.id, purposeId] });
      index.set(relevance, { consumerId: "DL02", definitionId: "diff.task-relevance/1", path: hunk.path, hunkId: hunk.id, diffDigest: hunk.diffDigest, rule: null });
      for (const rule of capture.rules) {
        const ruleId = `rule:${rule.id}`;
        addEvidence({ id: ruleId, text: `${rule.title}\n${rule.rationale}\n${rule.examples.join("\n")}`,
          sourceDigest: digest(rule), provenance: "supplied", trust: "untrusted" });
        const key = name();
        questions.push({ name: key, definitionId: "diff.rule-concern/1", consumerId: "DL02", evidenceIds: [hunk.id, ruleId, purposeId] });
        index.set(key, { consumerId: "DL02", definitionId: "diff.rule-concern/1", path: hunk.path, hunkId: hunk.id, diffDigest: hunk.diffDigest, rule });
      }
    }
  }
  return { evidence, questions, index };
}

function collect(prepared: Prepared, outcome: DecisionOutcome, consumerId: "DL01" | "DL02"): ReviewFinding[] {
  if (!outcome.delivered) return [];
  const findings: ReviewFinding[] = [];
  const seen = new Set<string>();
  for (const [name, meta] of prepared.index) {
    if (meta.consumerId !== consumerId) continue;
    const reading = interpretNoul(outcome.answers[name]);
    const concerning = meta.definitionId === "test.assertion-support/1" || meta.definitionId === "diff.task-relevance/1"
      ? reading.value === "negative" : reading.value === "positive";
    if (!concerning) continue;
    // Related findings deduplicate by rule and affected source while keeping their source reference.
    const key = `${meta.definitionId}\0${meta.path}\0${meta.rule?.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ consumerId, questionId: meta.definitionId, ruleId: meta.rule?.id ?? null, path: meta.path,
      interpretation: reading.value, probability: reading.probability,
      message: MESSAGES[meta.definitionId]!(meta.path, meta.rule), evidence: { hunkId: meta.hunkId, diffDigest: meta.diffDigest } });
  }
  return findings.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.questionId.localeCompare(right.questionId));
}

/**
 * Deliver DL01 and DL02 advice from one shared capture. Compatible questions share one request; any
 * disabled, shadowed or differently-scoped consumer falls back to its own request or its baseline.
 */
export async function reviewAdvice(runtime: DecisionRuntime, capture: ReviewCapture,
  scope: BudgetScope | null, options: { eventId: string; policyDigest: string; environment: string; revision: string }): Promise<ReviewAdvice> {
  const modes = { DL01: runtime.eligibility("DL01"), DL02: runtime.eligibility("DL02") } as const;
  const testHunks = capture.hunks.some(hunk => hunk.kind === "test");
  const active: Array<"DL01" | "DL02"> = [];
  if (modes.DL01.mode !== "off" && testHunks) active.push("DL01");
  if (modes.DL02.mode !== "off" && capture.hunks.length) active.push("DL02");
  const subject = { digest: capture.subjectDigest, revision: options.revision, environment: options.environment };
  const sourcePaths = capture.capturePaths;
  const decisions: ReviewAdvice["decisions"] = [];
  const advice = new Map<"DL01" | "DL02", ConsumerAdvice>();
  const record = (consumerId: "DL01" | "DL02", outcome: DecisionOutcome, prepared: Prepared | null) => {
    const assessed = prepared ? [...prepared.index.values()].filter(entry => entry.consumerId === consumerId).length : 0;
    const findings = prepared ? collect(prepared, outcome, consumerId) : [];
    advice.set(consumerId, { consumerId, mode: outcome.mode, effect: outcome.effect, reason: outcome.reason,
      delivered: outcome.delivered, assessed, findings, coverageLimits: capture.coverage.limits,
      summary: !outcome.delivered ? `No advice delivered (${outcome.reason}); the ordinary baseline applies.`
        : findings.length ? `${findings.length} semantic concern(s) in the assessed scope.`
        : "No concern found in the assessed scope. This is not proof of adequate coverage." });
  };
  // Compatible batch: identical evidence and data scope, the same resolved mode and one shared budget.
  const batched = active.length === 2 && modes.DL01.mode === modes.DL02.mode;
  if (!active.length) {
    for (const consumerId of ["DL01", "DL02"] as const) {
      const eligibility = modes[consumerId];
      advice.set(consumerId, { consumerId, mode: eligibility.mode, effect: eligibility.effect,
        reason: eligibility.mode === "off" ? (eligibility.reasons[0] ?? "consumer-off") : "no-assessable-evidence",
        delivered: false, assessed: 0, findings: [], coverageLimits: capture.coverage.limits,
        summary: "No advice delivered; the ordinary baseline applies." });
    }
  } else if (batched) {
    const prepared = prepare(capture, active);
    const outcome = await runtime.ask({ consumerId: "DL01", participants: ["DL02"], eventId: `${options.eventId}:DL01+DL02`,
      scope, subject, evidence: prepared.evidence, coverage: capture.coverage, questions: prepared.questions,
      sourcePaths, eligibilityDigest: null, policyDigest: options.policyDigest });
    decisions.push(receiptOf(outcome));
    for (const consumerId of active) record(consumerId, outcome, prepared);
  } else {
    for (const consumerId of active) {
      const prepared = prepare(capture, [consumerId]);
      const outcome = await runtime.ask({ consumerId, eventId: `${options.eventId}:${consumerId}`,
        scope, subject, evidence: prepared.evidence, coverage: capture.coverage, questions: prepared.questions,
        sourcePaths, eligibilityDigest: null, policyDigest: options.policyDigest });
      decisions.push(receiptOf(outcome));
      record(consumerId, outcome, prepared);
    }
    for (const consumerId of ["DL01", "DL02"] as const) if (!advice.has(consumerId)) {
      const eligibility = modes[consumerId];
      advice.set(consumerId, { consumerId, mode: eligibility.mode, effect: eligibility.effect,
        reason: eligibility.mode === "off" ? (eligibility.reasons[0] ?? "consumer-off") : "no-assessable-evidence",
        delivered: false, assessed: 0, findings: [], coverageLimits: capture.coverage.limits,
        summary: "No advice delivered; the ordinary baseline applies." });
    }
  }
  return { version: 1, kind: "project-governance-review-advice",
    authority: "advisory only: deterministic findings, checker results, required proof and exit status are unchanged",
    subjectDigest: capture.subjectDigest, purpose: capture.purpose, purposeSource: capture.purposeSource,
    batched, coverage: capture.coverage,
    consumers: (["DL01", "DL02"] as const).map(id => advice.get(id)!), decisions };
}
