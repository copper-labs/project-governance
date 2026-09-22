import { existsSync, realpathSync, linkSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { digest, durableJson, fileDigest, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { providerBinding } from "./provider-binding.ts";
import { providerCommand } from "./provider-command.ts";
import { captureProviderGuard, validateProviderGuard, outsideRoots, protectedPath, providerRoots, GUARDED_CLASS, type ProviderGuard } from "./provider-guard.ts";
import { decisionTaskContext } from "./decision-task-context.ts";
import { loadProfileDecisionSettings, resolveConsumerMode } from "./decision-settings.ts";
import type { CommandRequest } from "./process-owner.ts";
import { qualifiedProviderPair } from "./provider-qualification.ts";
export { qualifiedProviderPair } from "./provider-qualification.ts";
import { randomUUID } from "node:crypto";
import type { ProviderJobRequest } from "./provider-job.ts";

/** Current native adapters use hosted providers; a local-only assignment has no eligible backend. */
export function assertProviderDestination(request: Pick<ProviderJobRequest, "dataDestination">) {
  if (request.dataDestination === "local-only") throw new Error("Local-only assignment has no eligible local provider");
  if (request.dataDestination !== undefined && request.dataDestination !== "cloud-allowed") throw new Error("Invalid provider data destination");
}

export interface ProviderAdmission {
  version: 1; actionId: string; store: string; bindingDigest: string;
  binding: { requestDigest: string; taskId: string; taskVersion: number; config: string; configDigest: string;
    decisionDigest: string; assignmentClass: string; roots: string[]; jobRoot: string; registry: string; requiredTools: string[];
    baseline: ReturnType<typeof providerBinding>; guard: ProviderGuard; legacyPolicyDigest: string | null; legacyPolicyReviewed: boolean;
    operatorOverride: { model: string; effort: string; reason: string } | null;
    qualifications: Array<{ directory: string; requestDigest: string; resultDigest: string }> };
}

/** Report legacy prose without interpreting it as executable policy or routing consent. */
export function legacyProviderPolicy(workspace: string) {
  const path = join(workspace, "config/governance/model-selection.md");
  if (!existsSync(path)) return { path, digest: null, disposition: "absent" };
  return { path, digest: digest(narrativeFile(workspace, path)), disposition: "preserved-review-required" };
}

/** Trusted-host API only. Core record authority is provenance; this host admission owns transmission. */
export function authorizeProviderAssignment(options: { store: string; taskId: string; path: string; request: ProviderJobRequest;
  operatorOverride?: { model?: string; effort?: string; reason: string }; reviewedLegacyPolicyDigest?: string; qualifications?: Array<{ directory: string; requestDigest: string }> }) {
  const request = structuredClone(options.request);
  assertProviderDestination(request);
  if (request.admission || request.executable || request.provider !== "claude" || request.access !== "reader" ||
      !request.assignment || !request.config || !request.decision || request.conversationId) throw new Error("Guarded admission needs a new read-only Claude assignment and fixed config");
  const legacy = legacyProviderPolicy(request.workspace), mode = resolveConsumerMode(loadProfileDecisionSettings(request.workspace), "DL08");
  if (legacy.digest && mode.mode === "auto" && mode.effect === "route-model" && !options.operatorOverride &&
      options.reviewedLegacyPolicyDigest !== legacy.digest) throw new Error("Legacy model policy needs an explicit host review before category routing");
  const roots = providerRoots(request.workspace, request.additionalRoots);
  if (request.workspace !== roots[0]) throw new Error("Admission workspace must be canonical");
  outsideRoots(options.store, roots);
  const jobRoot = outsideRoots(realpathSync(dirname(options.path)), roots);
  if (protectedPath(options.path, roots) !== options.path) throw new Error("Admission path must be canonical");
  const config = outsideRoots(request.config, roots), baseline = providerBinding(request.provider, { config });
  outsideRoots(baseline.backend, roots);
  const guard = captureProviderGuard(baseline.backend);
  if (existsSync(options.path)) throw new Error("Provider admission already exists");
  let override: ProviderAdmission["binding"]["operatorOverride"] = null;
  if (options.operatorOverride) {
    const requested = options.operatorOverride;
    if (requested.model === undefined && requested.effort === undefined) throw new Error("Operator override must select a model or effort");
    const selected = providerBinding(request.provider, { ...requested, config });
    override = { model: selected.model, effort: selected.effort, reason: text(requested.reason, "operator override reason", 1000) };
  }
  const selected = override ?? baseline;
  if ((request.model !== undefined && request.model !== selected.model) || (request.effort !== undefined && request.effort !== selected.effort))
    throw new Error("Caller model does not match the trusted binding");
  const command = providerCommand({ ...request, model: selected.model, effort: selected.effort }, jobRoot, guard);
  const registry = protectedPath(command.coordination!.registry, roots), requiredTools = [...command.provider!.requiredTools].sort();
  const task = decisionTaskContext(request.decision, request.workspace);
  const store = new Store(options.store);
  try {
    const native = store.readTask(options.taskId);
    if (!native || native.status !== "open" || task.taskId !== native.taskId || task.revision !== String(native.version)) throw new Error("Guarded task identity differs from the host task");
    const qualifications = (options.qualifications ?? []).map(ref => {
      outsideRoots(ref.directory, roots);
      const proof = qualifiedProviderPair(ref.directory, ref.requestDigest, guard, roots, requiredTools, jobRoot);
      return { directory: ref.directory, requestDigest: ref.requestDigest, resultDigest: proof.resultDigest };
    });
    const binding: ProviderAdmission["binding"] = { requestDigest: digest(request), taskId: native.taskId, taskVersion: native.version,
      config, configDigest: fileDigest(config), decisionDigest: loadProfileDecisionSettings(request.workspace).configDigest,
      assignmentClass: GUARDED_CLASS, roots, jobRoot, registry, requiredTools, baseline, guard, legacyPolicyDigest: legacy.digest, legacyPolicyReviewed: !legacy.digest || options.reviewedLegacyPolicyDigest === legacy.digest, operatorOverride: override, qualifications };
    const bindingDigest = digest(binding);
    const authority = { operation: "record" as const, destination: null, scope: [request.workspace], targets: [request.workspace], policyRevision: bindingDigest };
    const action = authorizeAction(store, proposeAction(store, native.taskId, authority), authority, defaultPolicy(bindingDigest), request.workspace);
    if (action.status !== "authorized") throw new Error("Host assignment provenance refused");
    const admission: ProviderAdmission = { version: 1, actionId: action.actionId, store: options.store, bindingDigest, binding };
    const temporary = `${options.path}.${randomUUID()}.tmp`;
    try { durableJson(temporary, admission); linkSync(temporary, options.path); }
    finally { rmSync(temporary, { force: true }); }
    return { path: options.path, digest: fileDigest(options.path), bindingDigest, actionId: action.actionId };
  } finally { store.close(); }
}

export function readProviderAdmission(request: ProviderJobRequest, directory: string): ProviderAdmission | null {
  assertProviderDestination(request);
  if (!request.admission) return null;
  const path = realpathSync(request.admission);
  if (path !== request.admission) throw new Error("Provider admission path must be canonical");
  const admission = object(JSON.parse(narrativeFile(dirname(path), path))) as unknown as ProviderAdmission;
  const { admission: _reference, ...original } = request;
  const binding = admission.binding;
  if (legacyProviderPolicy(request.workspace).digest !== binding.legacyPolicyDigest) throw new Error("Legacy model policy changed");
  if (admission.version !== 1 || digest(binding) !== admission.bindingDigest || binding.requestDigest !== digest(original) ||
      request.executable || !request.config || realpathSync(request.config) !== binding.config || fileDigest(binding.config) !== binding.configDigest ||
      loadProfileDecisionSettings(request.workspace).configDigest !== binding.decisionDigest) throw new Error("Governed assignment policy or request changed");
  if (binding.assignmentClass !== GUARDED_CLASS || request.provider !== "claude" || !request.decision || request.access !== "reader" ||
      digest(binding.roots) !== digest(providerRoots(request.workspace, request.additionalRoots))) throw new Error("Guarded assignment capability differs");
  outsideRoots(path, binding.roots); outsideRoots(binding.config, binding.roots); outsideRoots(admission.store, binding.roots);
  const job = protectedPath(directory, binding.roots);
  if (dirname(job) !== binding.jobRoot) throw new Error("Guarded job must use its trusted admission directory");
  outsideRoots(binding.jobRoot, binding.roots); outsideRoots(binding.guard.executable, binding.roots);
  for (const trusted of [path, binding.config, admission.store, binding.registry]) protectedPath(trusted, [...binding.roots, job]);
  const command = providerCommand({ ...request, ...(binding.operatorOverride ?? {}) }, job, binding.guard);
  if (command.coordination?.registry !== binding.registry || digest([...command.provider!.requiredTools].sort()) !== digest(binding.requiredTools)) throw new Error("Guarded coordination or tools changed");
  if (digest(providerBinding(request.provider, { config: binding.config })) !== digest(binding.baseline)) throw new Error("Fixed provider binding changed");
  validateProviderGuard(binding.guard);
  const store = new Store(admission.store, { readOnly: true });
  try {
    const action = store.readAction(admission.actionId), task = store.readTask(binding.taskId);
    if (!action || action.status !== "authorized" || action.operation !== "record" || action.destination !== null ||
        action.policyRevision !== admission.bindingDigest || action.taskId !== binding.taskId || action.taskVersion !== binding.taskVersion ||
        task?.status !== "open" || task.version !== binding.taskVersion ||
        digest(action.scope) !== digest([request.workspace]) || digest(action.expectedInputs) !== digest([request.workspace])) throw new Error("Governed host authority changed");
  } finally { store.close(); }
  return admission;
}
