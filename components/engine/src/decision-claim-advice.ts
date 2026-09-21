import type { BoundClaimEvidence } from "./decision-claim-evidence.ts";
import { digest } from "./core.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretChoice, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";
import type { CommandReceipt } from "./process-owner.ts";
import type { providerResultSummary } from "./provider-result-summary.ts";

const MAX_CLAIMS = 4;
type ProviderSummary = NonNullable<ReturnType<typeof providerResultSummary>>;

export interface ClaimCorrection {
  claim: string; label: string; confidence: number | null; margin: number | null;
  evidence: { index: number | null; description: string | null }; message: string;
}
export interface ClaimAdvice {
  version: 1; kind: "project-governance-completion-claim-advice";
  authority: "advisory only: this is not a stop gate, an approval queue or an automatic test run; deterministic acceptance is unchanged";
  mode: string; effect: string; reason: string; delivered: boolean; evidenceBasis: "reported-only" | "file-consistent" | "mixed";
  nativeFacts: { state: string; exitCode: number | null; cleanup: string; reportedOutcome: string | null; remaining: string[]; truncatedReport: boolean };
  boundEvidence: BoundClaimEvidence[];
  assessedClaims: number;
  corrections: ClaimCorrection[];
  scope: { label: string; confidence: number | null } | null;
  correction: string | null;
  coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/**
 * Advice on one governed provider completion report. The parent report is identity-checked;
 * child check claims remain reported text and cannot establish verified support.
 */
export async function claimAdvice(runtime: DecisionRuntime, receipt: CommandReceipt, summary: ProviderSummary | null,
  scope: BudgetScope | null, options: { eventId: string; policyDigest: string; environment: string; revision: string; boundEvidence?: BoundClaimEvidence[] }): Promise<ClaimAdvice> {
  const eligibility = runtime.eligibility("DL09");
  const limits: string[] = [], unavailable: string[] = [];
  const completion = summary?.completion ?? null;
  const nativeFacts = { state: receipt.state, exitCode: receipt.exitCode, cleanup: receipt.cleanup,
    reportedOutcome: completion?.outcome ?? null, remaining: completion?.remaining ?? [], truncatedReport: summary?.truncated ?? false };
  const base: ClaimAdvice = {
    version: 1, kind: "project-governance-completion-claim-advice",
    authority: "advisory only: this is not a stop gate, an approval queue or an automatic test run; deterministic acceptance is unchanged",
    mode: eligibility.mode, effect: eligibility.effect, reason: eligibility.reasons[0] ?? "not-applicable", delivered: false,
    evidenceBasis: "reported-only", boundEvidence: options.boundEvidence ?? [], nativeFacts, assessedClaims: 0, corrections: [], scope: null, correction: null,
    coverage: { captured: 0, omitted: [], truncated: nativeFacts.truncatedReport, unavailable, limits }, decision: null,
  };
  if (!completion) { limits.push("no governed completion report is attached to this receipt"); return { ...base, reason: "no-completion-report" }; }
  // Honest partial and blocked reports are exempt; they already state their own limits.
  if (completion.outcome !== "completed") { limits.push(`reported outcome is ${completion.outcome}: an honest partial or blocked report is exempt`); return { ...base, reason: "honest-partial-report" }; }
  if (!completion.checks.length) { limits.push("the report cites no check evidence, so no claim has an applicable receipt"); return { ...base, reason: "no-cited-evidence" }; }

  const bound = new Map((options.boundEvidence ?? []).map(item => [item.claimIndex, item]));
  base.evidenceBasis = bound.size === 0 ? "reported-only" : completion.checks.every((_, index) => bound.has(index)) ? "file-consistent" : "mixed";
  applyNativeCorrections(base, completion.checks, bound);
  if (eligibility.mode === "off") return { ...base, reason: eligibility.reasons[0] ?? "consumer-off" };
  limits.push(bound.size ? "Only consistency of explicitly bound local files and quotes is checked; platform breadth and complete test coverage are not inferred from command success." : "Cited evidence is provider-reported text, not independently bound child-check receipts; this advice assesses report consistency only.");
  const claims = completion.checks.slice(0, MAX_CLAIMS);
  if (completion.checks.length > MAX_CLAIMS) limits.push(`only the first ${MAX_CLAIMS} cited claims are assessed`);
  const factsId = "native:receipt";
  const facts = { state: receipt.state, exitCode: receipt.exitCode, signal: receipt.signal, reason: receipt.reason,
    cleanup: receipt.cleanup, durationMs: receipt.durationMs, logBytes: receipt.logBytes,
    providerResultDigest: receipt.providerResultDigest ?? null, identity: summary?.identity ?? null };
  const evidence: EvidenceItem[] = [{ id: factsId, text: JSON.stringify(facts), sourceDigest: digest(facts), provenance: "captured", trust: "trusted" }];
  let remainingBytes = runtime.settings.legacy.evidenceBytes - Buffer.byteLength(evidence[0]!.text);
  const questions: QuestionInstance[] = [];
  const index = new Map<string, { claim: string; position: number; description: string }>();
  claims.forEach((check, position) => {
    const claimId = `claim:${position + 1}`;
    const native = bound.get(position);
    const body = JSON.stringify({ claim: check.description, reportedResult: check.result,
      evidenceBasis: native ? "file-consistent" : "reported-only", evidence: native ?? check.evidence });
    if (Buffer.byteLength(body) > remainingBytes) { limits.push(`claim ${position + 1} retained without semantic assessment: evidence byte limit`); return; }
    remainingBytes -= Buffer.byteLength(body);
    evidence.push({ id: claimId, text: body, sourceDigest: digest(body), provenance: "supplied", trust: "untrusted" });
    const name = `claim${position + 1}`;
    questions.push({ name, definitionId: "claim.support/1", consumerId: "DL09", evidenceIds: [claimId, factsId],
      candidates: DECISION_QUESTIONS["claim.support/1"]!.options!.map(id => ({ id, description: id })) });
    index.set(name, { claim: check.description, position, description: check.evidence });
  });
  const reportId = "report:completion";
  const report = { outcome: completion.outcome, answer: completion.answer.slice(0, 4000), artifacts: completion.artifacts,
    sources: completion.sources, remaining: completion.remaining };
  const reportBody = JSON.stringify(report);
  if (Buffer.byteLength(reportBody) <= remainingBytes) {
  evidence.push({ id: reportId, text: reportBody, sourceDigest: digest(report), provenance: "supplied", trust: "untrusted" });
  questions.push({ name: "scope", definitionId: "claim.completion-scope/1", consumerId: "DL09",
    evidenceIds: [reportId, factsId, ...evidence.filter(item => item.id.startsWith("claim:")).map(item => item.id)],
    candidates: DECISION_QUESTIONS["claim.completion-scope/1"]!.options!.map(id => ({ id, description: id })) });
  } else limits.push("completion scope retained without semantic assessment: evidence byte limit");

  const coverage: DecisionCoverage = { captured: evidence.length, omitted: [], truncated: nativeFacts.truncatedReport, unavailable, limits };
  const outcome = await runtime.ask({ consumerId: "DL09", eventId: `${options.eventId}:DL09:${receipt.requestDigest}:${digest(options.boundEvidence ?? [])}`, scope,
    subject: { digest: receipt.providerResultDigest ?? receipt.requestDigest, revision: options.revision, environment: options.environment },
    evidence, coverage, questions, eligibilityDigest: null, policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  if (!outcome.delivered) return { ...base, mode: outcome.mode, reason: outcome.reason, coverage, decision };
  const corrections: ClaimCorrection[] = [...base.corrections];
  for (const [name, meta] of index) {
    const reading = interpretChoice(outcome.answers[name]);
    if (!reading.value || reading.value === "supported") continue;
    corrections.push({ claim: meta.claim, label: reading.value, confidence: reading.confidence, margin: reading.margin,
      evidence: { index: meta.position + 1, description: meta.description },
      message: reading.value === "contradicted" ? "The report contains an apparent inconsistency between this claim and its own evidence description; neither is independently verified here."
        : reading.value === "unrelated" ? "The reported evidence description appears to describe different work."
        : "The reported evidence description appears insufficient for this claim." });
  }
  const scopeReading = interpretChoice(outcome.answers["scope"]);
  const scopeLabel = scopeReading.value && scopeReading.value !== "within-evidence"
    ? { label: scopeReading.value, confidence: scopeReading.confidence } : null;
  const parts: string[] = [];
  if (scopeLabel) parts.push(scopeLabel.label === "broader-than-evidence"
    ? "The reported completion scope appears broader than its cited evidence; narrow the report or cite the missing evidence."
    : "The reported completion scope appears unrelated to its cited evidence.");
  for (const entry of corrections) parts.push(`${entry.claim}: ${entry.message}`);
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true, coverage, decision,
    assessedClaims: index.size, corrections, scope: scopeLabel,
    correction: parts.length ? parts.join(" ").slice(0, 2000) : null };
}

/** Native contradictions never depend on optional inference or its availability. */
function applyNativeCorrections(base: ClaimAdvice, checks: NonNullable<ProviderSummary["completion"]>["checks"], bound: Map<number, BoundClaimEvidence>): void {
  for (const [position, native] of bound) {
    const check = checks[position];
    if (check && !/^(failed|failure|blocked|cancelled|canceled|unknown|not run|skipped)$/u.test(check.result.trim().toLowerCase()) &&
        (native.state !== "succeeded" || native.exitCode !== 0 || native.cleanup !== "confirmed")) {
      const message = `The cited command files record state=${native.state}, exitCode=${native.exitCode}, cleanup=${native.cleanup}; it does not establish a clean pass.`;
      base.corrections.push({ claim: check.description, label: "native-result-not-passed", confidence: null, margin: null,
        evidence: { index: position + 1, description: native.directory }, message });
    }
  }
  base.correction = base.corrections.length ? base.corrections.map(item => item.message).join(" ") : null;
}
