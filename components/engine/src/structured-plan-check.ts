import { decodePlanBytes, hasImplementationPlanDeclaration, implementationPlanFindings, parseImplementationPlan } from "./implementation-plan.ts";
import { historicalPlanProofFindings } from "./plan-proof.ts";
import type { ChangeScope, ValidationSubject } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import type { Finding } from "./checker-results.ts";

/** Adopted plans enter the existing documentation gate. Old prose plans remain readable and untouched. */
export function checkStructuredPlans(subject: ValidationSubject, scope: ChangeScope, packs?: Packs, runsRoot?: string): Finding[] {
  const findings: Finding[] = [], changed = new Set(scope.records.flatMap(record => record.previous_path ? [record.path, record.previous_path] : [record.path]));
  if (scope.mode !== "all" && ![...changed].some(path => /^docs\/.+\.md$/u.test(path))) return findings;
  for (const path of subject.paths().filter(path => /^docs\/exec-plans\/.*\.md$/u.test(path))) {
    try {
      const content = decodePlanBytes(subject.read(path));
      if (!hasImplementationPlanDeclaration(content)) continue;
      const plan = parseImplementationPlan(path, content);
      if (scope.mode !== "all" && !changed.has(path) && !plan.declaration.specifications.some(spec => changed.has(spec.path))) continue;
      if (!packs) throw new Error("Configured check registry is required");
      findings.push(...implementationPlanFindings(subject, path, packs));
      for (const slot of plan.slots.values()) {
        if (!slot.completed || slot.item.kind !== "verification") continue;
        // Retained completion is historical proof, not freshness for every later batch or release.
        findings.push(...historicalPlanProofFindings({ subject, scope, packs, plan, item: slot.item, reference: slot.evidence.at(-1), ...(runsRoot ? { runsRoot } : {}) }));
      }
    } catch { findings.push({ rule_id: "implementation-plan.proof-invalid", severity: "blocking", path, message: "Structured plan or completed check proof is unresolved, stale or incomplete. Reconcile its declared scope and original evidence." }); }
  }
  return findings;
}
