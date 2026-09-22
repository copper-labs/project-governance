import { loadProfileDecisionSettings, resolveConsumerMode } from "./decision-settings.ts";
import { legacyProviderPolicy, readProviderAdmission, qualifiedProviderPair } from "./provider-admission.ts";
import { providerCommand } from "./provider-command.ts";
import { providerBinding, ProviderBindingError, type NativeProvider } from "./provider-binding.ts";

/** Inspect explicit selection and local executability only. No authentication, model or network probes. */
export function providerDoctor(provider: NativeProvider, options: Parameters<typeof providerBinding>[1] = {}, environment: NodeJS.ProcessEnv = process.env) {
  const base = { version: 1, authentication: "not-probed", nativeCapabilities: "not-probed", network: "not-attempted", mutation: "none" };
  try {
    const selected = providerBinding(provider, options, environment);
    return { ...base, status: "passed", availability: "executable-resolved", reason: null, ...selected };
  } catch (error) {
    return { ...base, status: "failed", availability: "not-ready", reason: error instanceof ProviderBindingError ? error.code : "invalid-configuration" };
  }
}

/** Assignment inspection is passive: retained authority and native receipts, with no paid probes. */
export function providerAssignmentDoctor(request: import("./provider-job.ts").ProviderJobRequest, directory: string) {
  const base = providerDoctor(request.provider, request);
  if (base.status !== "passed" || !("model" in base)) return base;
  let phase = "profile";
  try {
    const settings = loadProfileDecisionSettings(request.workspace), activation = resolveConsumerMode(settings, "DL08");
    const mapping = settings.modelRouting.providers[request.provider], legacy = legacyProviderPolicy(request.workspace);
    phase = "admission";
    const admission = readProviderAdmission(request, directory);
    if (mapping?.require_governed_entry && !admission) throw new Error("Trusted admission required");
    phase = "native-command"; providerCommand(request, directory, admission?.binding.guard);
    phase = "qualification";
    const proofs = admission?.binding.qualifications.map(ref => {
      try {
        const pair = qualifiedProviderPair(ref.directory, ref.requestDigest, admission.binding.guard,
          admission.binding.roots, admission.binding.requiredTools, admission.binding.jobRoot);
        if (pair.resultDigest !== ref.resultDigest) throw new Error("qualification-result-changed");
        return { ...pair, status: "qualified", reason: null };
      } catch (error) { return { status: "unqualified", reason: error instanceof Error && /^qualification-[a-z-]+$/u.test(error.message) ? error.message : "qualification-unreadable" }; }
    }) ?? [];
    const qualified = (model: string, effort: string) => proofs.some(proof => "model" in proof && proof.model === model && proof.effort === effort);
    const baseline = admission?.binding.baseline ?? base;
    const baselineQualified = qualified(String(baseline.model), String(baseline.effort));
    const categories = Object.entries(mapping?.categories ?? {}).map(([id, pair]) => ({ id, ...pair, qualified: qualified(pair.model, pair.effort) }));
    return { ...base, routing: { mode: activation.mode, effect: activation.effect, baselineQualified, categories, proofs,
      status: admission && activation.mode === "auto" && activation.effect === "route-model" && baselineQualified && categories.some(item => item.qualified)
        ? "eligible-subject-to-decision-and-dispatch-recheck" : "baseline-only",
      override: admission?.binding.operatorOverride ?? null },
      routeCoverage: admission ? "guarded-child" : "admission-only", outsideEntryActivity: "unknown", legacyPolicy: legacy,
      migrationProposal: { preserveLegacyFile: true, fixedBinding: { model: baseline.model, effort: baseline.effort },
        candidates: categories, routingConsentInferred: false, legacyReviewed: admission?.binding.legacyPolicyReviewed ?? false } };
  } catch (error) { return { ...base, status: "failed", reason: "assignment-preflight-failed",
    phase, detail: error instanceof Error && /^(?:Local-only assignment|Invalid provider data destination|Trusted admission|Governed assignment|Guarded |Provider admission|Legacy model policy|Fixed provider binding|Assignment is incompatible)[A-Za-z -]*$/u.test(error.message)
      ? error.message : "Assignment evidence is unavailable or invalid; inspect the indicated phase",
    routeCoverage: "unqualified", network: "not-attempted", mutation: "none" }; }
}
