/** Versioned trusted-host API. Models must not receive authority through this surface. */
export const HOST_API_VERSION = 1 as const;
export { Store } from "../../harness/src/store/store.ts";
export { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
export { defaultPolicy } from "../../harness/src/ops/authority.ts";
export { WorkflowStore } from "./workflow-store.ts";
export { resolveWorkflowRecipe } from "./workflow-catalog.ts";
export { recipeDigest } from "./workflow-types.ts";
export type { Recipe, RunBinding, RunState } from "./workflow-types.ts";
export type { WorkflowRun } from "./workflow-store.ts";
export { digest, fileDigest } from "./core.ts";
export { ResourceRegistry, resourceRegistryPath } from "./resources.ts";

export { diagnoseWorkflow } from "./workflow-diagnose.ts";
export { diagnosticEpisodeId, diagnosticOperationId, resolveDiagnosticManifest } from "./diagnostic-manifest.ts";
export type { DiagnosticManifest } from "./diagnostic-manifest.ts";
export { authorizeProviderAssignment } from "./provider-admission.ts";
export { authorizeProviderContinuation } from "./provider-continuation.ts";
export { observeAndroidCapacity, observeAndroidEmulatorCleanup } from "./android-emulator.ts";
