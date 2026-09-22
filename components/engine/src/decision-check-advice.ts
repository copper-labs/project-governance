import { parse } from "yaml";
import { digest, fileDigest } from "./core.ts";
import { join } from "node:path";
import { checkRunRoot } from "./check-run.ts";
import { inspectCheckRun, readCheckRecord } from "./check-status.ts";
import { safeSubjectPath, type ChangeScope, type ValidationSubject } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import type { ValidationPlan } from "./planning.ts";
import { profileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { contextStateRoot } from "./context-command.ts";
import { captureReviewEvidence, parseReviewRules, reviewAdvice } from "./decision-review.ts";
import { validationAdvice, validationCounterfactual } from "./decision-validation-advice.ts";
import type { DecisionOptions } from "./decisions.ts";
import { decisionTaskContext, decisionTaskPurpose, type DecisionTaskContext } from "./decision-task-context.ts";
import { recordEntryExposure } from "./decision-episodes.ts";

export interface CheckAdviceOptions {
  taskId?: string; revision?: string; purpose?: string; reviewRules?: string;
  context?: DecisionTaskContext;
  runId?: string; compareRun?: string;
}

/** Separate optional projection: never replace checker findings, validation selection or exit status. */
export async function checkDecisionAdvice(prepared: { subject: ValidationSubject; scope: ChangeScope; registry: Packs; plan: ValidationPlan },
  options: CheckAdviceOptions, reviews: boolean, cancellation: DecisionOptions = {}) {
  let boundScope: ReturnType<typeof resolveDecisionScope> = null;
  const record = (reason: string, decisions: Array<{ receiptId: string | null; reason: string; delivered: boolean; providerCalled?: boolean | undefined }>) => {
    let completion: Record<string, unknown> | null = null;
    try {
      const directory = options.runId ? join(checkRunRoot(), options.runId) : null;
      const observed = options.runId ? inspectCheckRun(options.runId) : null;
      if (observed?.state === "terminal" && directory) completion = { runId: options.runId, resultDigest: digest(observed.result),
        resultFileDigest: fileDigest(join(directory, "result.json")), status: observed.status };
    } catch { /* Missing telemetry cannot discard already computed advice or invent terminal proof. */ }
    return recordEntryExposure(contextStateRoot(prepared.subject.root), { caller: reviews ? "check" : "plan", entryKind: completion ? "check-completion" : "check-plan", scope: boundScope,
      native: { subjectDigest: prepared.scope.subject_digest ?? digest(prepared.scope), planDigest: digest(prepared.plan), stage: prepared.plan.stage, ...completion },
      exposure: { reached: true, reason, reviewRequested: reviews, scope: boundScope ? "bound" : "unavailable", used: null,
        decisions: decisions.map(row => ({ receiptId: row.receiptId, reason: row.reason, called: row.providerCalled ?? null, delivered: row.delivered })),
        outsideEntryActivity: "unknown", acceptedOutcome: "unknown", totalModelTokens: null },
      decisions: decisions.flatMap(row => row.receiptId ? [row.receiptId] : []) });
  };
  try {
    const { subject, scope, registry, plan } = prepared;
    const profilePath = "config/governance/profile.yaml";
    const profile = subject.source(profilePath)?.file_type === "regular" ? subject.read(profilePath, 1024 * 1024) : null;
    const settings = profileDecisionSettings(profile ? parse(profile.toString("utf8")) : {});
    const runtime = new DecisionRuntime(settings, contextStateRoot(subject.root), cancellation);
    const context = options.context ? decisionTaskContext(options.context, subject.root) : undefined;
    const binding = resolveDecisionScope(subject.root, { ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      ...(options.revision === undefined ? {} : { revision: options.revision }) }, context);
    boundScope = binding;
    if (settings.mode === "off") { record("consumer-off", []); return null; }
    const purpose = context ? decisionTaskPurpose(context) : options.purpose;
    const revision = binding?.taskRevision ?? "unbound";
    const identity = { subject: scope.subject_digest, config: settings.configDigest, purpose: purpose ?? null, plan: digest(plan), registry: digest(registry), reviewRules: options.reviewRules ?? null };
    const common = { eventId: digest(identity), policyDigest: digest(profile?.toString("base64") ?? null), environment: scope.mode,
      revision, subjectDigest: scope.subject_digest ?? digest(scope) };
    let review = null;
    const sourcePaths = new Set<string>([profilePath]);
    if (reviews && (runtime.eligibility("DL01").mode !== "off" || runtime.eligibility("DL02").mode !== "off")) {
      const rulesPath = options.reviewRules === undefined ? null : safeSubjectPath(options.reviewRules);
      const rules = rulesPath ? parseReviewRules(JSON.parse(subject.read(rulesPath, 64 * 1024).toString("utf8"))) : [];
      const capture = captureReviewEvidence(subject, scope, { purpose: purpose ?? "Task purpose unavailable; abstain on task-specific claims.",
        purposeSource: context ? "bound-task-context" : options.purpose ? "explicit-invocation" : "unavailable", rules, maximumBytes: settings.legacy.evidenceBytes,
        includeSource: settings.questionIds.DL01.includes("test.requirement-support/1") || settings.questionIds.DL02.includes("change.requirement-support/1") });
      if (rulesPath) { sourcePaths.add(rulesPath); capture.capturePaths.push(rulesPath); }
      for (const path of capture.capturePaths) { sourcePaths.add(path); subject.read(path, 1024 * 1024); }
      review = await reviewAdvice(runtime, capture, binding, { ...common, eventId: digest({ identity, rules }) });
    }
    const validation = plan.status === "ready" && runtime.eligibility("DL07").mode !== "off"
      ? await validationAdvice(runtime, registry, plan, binding, { ...common, ...(purpose ? { requirement: purpose } : {}) }) : null;
    for (const path of sourcePaths) if (subject.source(path)?.file_type === "regular") subject.read(path, 1024 * 1024);
    let comparison = null;
    const comparisonRun = options.compareRun ?? options.runId;
    if (validation && comparisonRun) {
      try {
      const observed = inspectCheckRun(comparisonRun), directory = join(checkRunRoot(), comparisonRun);
      comparison = observed.state === "terminal" ? {
        ...validationCounterfactual(validation, readCheckRecord(join(directory, "run.json")), observed.result),
        source: { runId: comparisonRun, resultDigest: fileDigest(join(directory, "result.json")) },
      } : { status: "unmatched", comparisons: [], savings: null };
      } catch { comparison = { status: "unavailable", comparisons: [], savings: null }; }
    }
    const episode = record(binding ? "observed" : "scope-unavailable", [...(review?.decisions ?? []), ...(validation?.decision ? [validation.decision] : [])]);
    return { version: 1, review, validation, comparison, episode, authority: "advice only; native checks and selection unchanged" };
  } catch {
    try { record("advice-unavailable-or-stale", []); } catch { /* Native result remains authoritative. */ }
    return { version: 1, review: null, validation: null, reason: "advice-unavailable-or-stale",
      authority: "advice only; native checks and selection unchanged" };
  }
}
