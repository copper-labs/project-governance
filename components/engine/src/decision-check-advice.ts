import { parse } from "yaml";
import { digest } from "./core.ts";
import { safeSubjectPath, type ChangeScope, type ValidationSubject } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import type { ValidationPlan } from "./planning.ts";
import { profileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { contextStateRoot } from "./context-command.ts";
import { captureReviewEvidence, parseReviewRules, reviewAdvice } from "./decision-review.ts";
import { validationAdvice } from "./decision-validation-advice.ts";
import type { DecisionOptions } from "./decisions.ts";

export interface CheckAdviceOptions {
  taskId?: string; revision?: string; purpose?: string; reviewRules?: string;
}

/** Separate optional projection: never replace checker findings, validation selection or exit status. */
export async function checkDecisionAdvice(prepared: { subject: ValidationSubject; scope: ChangeScope; registry: Packs; plan: ValidationPlan },
  options: CheckAdviceOptions, reviews: boolean, cancellation: DecisionOptions = {}) {
  try {
    const { subject, scope, registry, plan } = prepared;
    const profilePath = "config/governance/profile.yaml";
    const profile = subject.source(profilePath)?.file_type === "regular" ? subject.read(profilePath, 1024 * 1024) : null;
    const settings = profileDecisionSettings(profile ? parse(profile.toString("utf8")) : {});
    if (settings.mode === "off") return null;
    const runtime = new DecisionRuntime(settings, contextStateRoot(subject.root), cancellation);
    const binding = resolveDecisionScope(subject.root, { ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      ...(options.revision === undefined ? {} : { revision: options.revision }) });
    const revision = binding?.taskRevision ?? "unbound";
    const identity = { subject: scope.subject_digest, config: settings.configDigest, purpose: options.purpose ?? null, plan: digest(plan), registry: digest(registry), reviewRules: options.reviewRules ?? null };
    const common = { eventId: digest(identity), policyDigest: digest(profile?.toString("base64") ?? null), environment: scope.mode,
      revision, subjectDigest: scope.subject_digest ?? digest(scope) };
    let review = null;
    const sourcePaths = new Set<string>([profilePath]);
    if (reviews && (runtime.eligibility("DL01").mode !== "off" || runtime.eligibility("DL02").mode !== "off")) {
      const rulesPath = options.reviewRules === undefined ? null : safeSubjectPath(options.reviewRules);
      const rules = rulesPath ? parseReviewRules(JSON.parse(subject.read(rulesPath, 64 * 1024).toString("utf8"))) : [];
      const capture = captureReviewEvidence(subject, scope, { purpose: options.purpose ?? "Task purpose unavailable; abstain on task-specific claims.",
        purposeSource: options.purpose ? "explicit-invocation" : "unavailable", rules, maximumBytes: settings.legacy.evidenceBytes });
      if (rulesPath) { sourcePaths.add(rulesPath); capture.capturePaths.push(rulesPath); }
      for (const path of capture.capturePaths) { sourcePaths.add(path); subject.read(path, 1024 * 1024); }
      review = await reviewAdvice(runtime, capture, binding, { ...common, eventId: digest({ identity, rules }) });
    }
    const validation = plan.status === "ready" && runtime.eligibility("DL07").mode !== "off"
      ? await validationAdvice(runtime, registry, plan, binding, common) : null;
    for (const path of sourcePaths) if (subject.source(path)?.file_type === "regular") subject.read(path, 1024 * 1024);
    return { version: 1, review, validation, authority: "advice only; native checks and selection unchanged" };
  } catch {
    return { version: 1, review: null, validation: null, reason: "advice-unavailable-or-stale",
      authority: "advice only; native checks and selection unchanged" };
  }
}
