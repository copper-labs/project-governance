import { digest } from "./core.ts";
import { readProviderAdmission, qualifiedProviderPair } from "./provider-admission.ts";
import { providerCommand } from "./provider-command.ts";
import { loadProfileDecisionSettings, resolveConsumerMode } from "./decision-settings.ts";
import { providerFollowUp } from "./provider-follow-up.ts";
import type { CommandRequest } from "./process-owner.ts";

/** Re-run admission in the detached owner, before any native child or credential expansion. */
export function validateGuardedDispatch(request: CommandRequest, directory: string) {
  const guard = request.provider?.guard, bound = request.decisionBinding;
  if (!guard) {
    if (bound?.admission) throw new Error("Guarded admission cannot launch an unrestricted worker");
    return;
  }
  if (!bound?.sourceRequest || !bound.admissionPath || !bound.admission || !request.assignment)
    throw new Error("Guarded dispatch lacks a bound new submission");
  const admission = readProviderAdmission(bound.sourceRequest, directory);
  if (!admission || digest(admission) !== digest(bound.admission) || bound.sourceRequest.admission !== bound.admissionPath ||
      digest(guard) !== digest(admission.binding.guard) || digest(bound.task) !== digest(bound.sourceRequest.decision) ||
      bound.configDigest !== admission.binding.decisionDigest) throw new Error("Guarded dispatch admission changed");
  const binding = admission.binding, settings = loadProfileDecisionSettings(request.operation.cwd), route = bound.routing;
  let selected = binding.operatorOverride ?? binding.baseline;
  if (route?.applied) {
    const mode = resolveConsumerMode(settings, "DL08"), category = route.category && settings.modelRouting.providers.claude?.categories[route.category];
    if (binding.operatorOverride || mode.mode !== "auto" || mode.effect !== "route-model" || !category ||
        !settings.modelRouting.providers.claude?.assignment_classes.includes(binding.assignmentClass) || digest(route.selected) !== digest({ model: category.model, effort: category.effort })) throw new Error("Guarded routing mapping changed");
    const qualifiedPairs = binding.qualifications.flatMap(ref => {
      try { const pair = qualifiedProviderPair(ref.directory, ref.requestDigest, guard, binding.roots, binding.requiredTools, binding.jobRoot);
        return pair.resultDigest === ref.resultDigest ? [pair] : []; } catch { return []; }
    });
    for (const selected of [binding.baseline, category]) if (!qualifiedPairs.some(pair => pair.model === selected.model && pair.effort === selected.effort))
      throw new Error("Guarded routed capability is no longer qualified");
    selected = { ...binding.baseline, model: category.model, effort: category.effort };
  }
  if (request.parent) {
    if (!bound?.continuation) throw new Error("Guarded continuation lacks trusted admission");
    const continued = bound.continuation;
    const planned = providerFollowUp(request.parent.directory, request.parent.requestDigest,
      { ...continued.next, directory, admission: continued.path });
    for (const key of ["operation", "provider", "stdin", "assignment", "coordination", "decisionBinding", "parent", "deadlineMs", "outputLimit", "idleTimeoutMs"] as const) {
      const expected = key === "parent" ? planned.parent : planned.command[key];
      if (digest(expected ?? null) !== digest(request[key] ?? null)) throw new Error("Guarded continuation dispatch differs");
    }
    return;
  }
  const expected = providerCommand({ ...bound.sourceRequest, model: selected.model, effort: selected.effort,
    assignment: { ...bound.sourceRequest.assignment!, context: request.assignment.context } }, directory, guard);
  for (const key of ["operation", "provider", "stdin", "assignment", "coordination", "deadlineMs", "outputLimit", "idleTimeoutMs"] as const)
    if (digest(expected[key] ?? null) !== digest(request[key] ?? null)) throw new Error("Guarded native command differs from admitted command");
}
