import { fileURLToPath } from "node:url";
import { narrativeFile } from "./narrative-inputs.ts";

/** Read the one packaged command guide; host entry files contain only the route. */
export function providerGuidance(assetRoot = fileURLToPath(new URL("../assets/skills/resources/", import.meta.url))) {
  return narrativeFile(assetRoot, "compiled-provider-commands.md");
}

/** Startup guidance ships with the same pinned runtime that evaluates the operation. */
export function startupGuidance(assetRoot = fileURLToPath(new URL("../assets/skills/resources/", import.meta.url))) {
  return narrativeFile(assetRoot, "compiled-startup-updates.md");
}

export const COMPILED_HOST_BLOCK = `<!-- harness-delegation:start -->
Cross-model work uses this project's compiled governance runtime unless the operator explicitly selects another route.
Before delegating, run the absolute repository-local \`.governance/runtime/bin/project-governance provider-help\` and follow its assignment, observation and cleanup contract.
Before substantial builds or test batches, use that runtime's \`context-route --task <task> --revision <revision>\`, read its required test-execution guidance, and choose the cheapest reliable proof path.
Read shared skill discovery and referenced resources through \`skill-read --path catalog.yaml\` or a path relative to the packaged skills root.
If that installed command is unavailable, return the installation mismatch to the parent; do not silently fall back or bootstrap from a delegated worker.
<!-- harness-delegation:end -->`;
