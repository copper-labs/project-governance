import type { CompletionTarget } from "./completion-delivery.ts";
import { providerCommand } from "./provider-command.ts";
import { providerRuntime } from "./provider-runtime.ts";
import { submitCommand } from "./process-owner.ts";
import { providerFollowUp } from "./provider-follow-up.ts";
import { digest } from "./core.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileCommand } from "./command-recovery.ts";
import { decisionTaskContext, type DecisionTaskContext } from "./decision-task-context.ts";
import { providerContext } from "./provider-context.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import type { CommandRequest } from "./process-owner.ts";
import { recordEntryExposure } from "./decision-episodes.ts";
import { contextStateRoot } from "./context-command.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { assertProviderDestination, readProviderAdmission } from "./provider-admission.ts";
import { routeProviderModel } from "./decision-model-routing.ts";

export type ProviderJobRequest = Parameters<typeof providerCommand>[0] & {
  decision?: DecisionTaskContext; admission?: string; dataDestination?: "cloud-allowed" | "local-only";
};

/** Explicit parent submission, never a governance check or automatic model selection. */
export async function submitProviderJob(directory: string, request: ProviderJobRequest, completion?: CompletionTarget) {
  request = structuredClone(request);
  assertProviderDestination(request);
  if (!request.assignment) throw new Error("Provider jobs require a structured parent assignment");
  const admission = readProviderAdmission(request, directory);
  const runtime = providerRuntime(request.workspace);
  // Validate native configuration and caller identity before optional selection can incur cost.
  const selectedOverride = admission?.binding.operatorOverride;
  const fixed = { ...request, ...(selectedOverride ? { model: selectedOverride.model, effort: selectedOverride.effort } : {}) };
  providerCommand(fixed, directory, admission?.binding.guard);
  const task = request.decision === undefined ? undefined : decisionTaskContext(request.decision, request.workspace);
  const settings = loadProfileDecisionSettings(request.workspace);
  if (!admission && settings.modelRouting.providers[request.provider]?.require_governed_entry)
    throw new Error(`Provider ${request.provider} requires trusted guarded admission under require_governed_entry`);
  const submissionDigest = digest({ request, completion: completion ?? null });
  if (existsSync(directory)) {
    if (!existsSync(join(directory, "request.json"))) throw new Error("Provider submission unresolved; request persistence was interrupted");
    const retained = JSON.parse(narrativeFile(directory, "request.json")) as CommandRequest;
    if (retained.decisionBinding) {
      if (retained.decisionBinding.submissionDigest !== submissionDigest || retained.decisionBinding.configDigest !== settings.configDigest ||
          digest(retained.runtime) !== digest(runtime) || digest(retained.decisionBinding.admission ?? null) !== digest(admission)) throw new Error("Provider submission or policy identity conflict");
      return submitCommand(directory, retained);
    }
    // Older immutable jobs retain the original replay path; they cannot acquire a new task binding.
    if (task) throw new Error("Existing provider job lacks the requested decision binding");
    return submitCommand(directory, { ...providerCommand(request, directory), runtime, ...(completion ? { completion } : {}) });
  }
  const packet = await providerContext(request.workspace, task);
  const routing = admission && task ? await routeProviderModel(admission, task) : null;
  if (loadProfileDecisionSettings(request.workspace).configDigest !== settings.configDigest) throw new Error("Decision policy changed during provider preparation");
  if (admission && digest(readProviderAdmission(request, directory)) !== digest(admission)) throw new Error("Provider authority changed before dispatch");
  const command = providerCommand({ ...fixed, ...(routing ? routing.selected : {}), assignment: { ...request.assignment,
    context: [request.assignment.context, packet.text].filter(Boolean).join("\n\n") } }, directory, admission?.binding.guard);
  const submitted = submitCommand(directory, { ...command, runtime, ...(completion ? { completion } : {}),
    decisionBinding: { submissionDigest, configDigest: settings.configDigest, task: task ?? null, context: packet.delivery,
      ...(admission ? { sourceRequest: request } : {}),
      ...(admission && request.admission ? { admission, admissionPath: request.admission } : {}), ...(routing ? { routing } : {}) } });
  recordEntryExposure(contextStateRoot(request.workspace), { caller: "provider-submit", entryKind: "provider-submit",
    scope: task ? resolveDecisionScope(request.workspace, {}, task) : null,
    native: { requestDigest: submitted.requestDigest, id: request.id, model: command.provider!.model, effort: command.provider!.effort },
    exposure: { reached: true, context: packet.delivery, submitted: true, used: null,
      routing, routeCoverage: admission ? "guarded-child" : "admission-only", outsideEntryActivity: "unknown", totalModelTokens: null, acceptedOutcome: "unknown" },
    decisions: [routing?.decision?.receiptId, "decisionReceipt" in packet.delivery ? packet.delivery.decisionReceipt : null]
      .filter((id): id is string => typeof id === "string") });
  return submitted;
}

/** Resume a verified native session with its original authority and installed runtime identity. */
export function submitProviderFollowUp(parentDirectory: string, parentDigest: string, next: import("./provider-continuation.ts").ProviderContinuation) {
  const plan = providerFollowUp(parentDirectory, parentDigest, next);
  if (!plan.command.assignment) throw new Error("Provider continuation requires the original structured assignment");
  const prior = JSON.parse(readFileSync(join(parentDirectory, "request.json"), "utf8"));
  if (digest(prior) !== parentDigest || prior.runtime === undefined) throw new Error("Provider parent runtime binding missing or changed");
  const runtime = providerRuntime(plan.command.operation.cwd);
  if (digest(runtime) !== digest(prior.runtime)) throw new Error("Provider runtime changed since parent assignment");
  reconcileCommand(parentDirectory, parentDigest);
  return submitCommand(next.directory, { ...plan.command, runtime, parent: plan.parent, ...(prior.completion ? { completion: prior.completion } : {}) });
}
