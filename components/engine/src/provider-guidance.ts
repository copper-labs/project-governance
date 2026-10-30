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
Use the repository-local \`.governance/runtime/bin/project-governance\` for task binding, context routing and checks. Keep all three on this installed runtime.
Use the current coding agent and its fixed host model by default. Do not start a second model or subagent unless the operator requested it or a project-owned required review calls for it. JEV advice does not authorize delegation.
When delegation is authorized, run that runtime's \`provider-help\` and follow its assignment, observation and cleanup contract unless the operator explicitly selects another route. Consultation skills supply review guidance; the installed provider runner owns execution and uses the native provider executable.
At top-level development task entry, create or deliberately resume this session's continuity task with that runtime's \`harness task create --outcome <goal> --acceptance <criterion> --scope <relevant path>\` or \`harness resume --task <id>\`. Keep the binding for the task; do not create new tasks for retries. Subagents use their captured assignment and never rebind the parent's session.
The prompt hook supplies required governance instructions and current task facts, not speculative repository evidence. Follow those instructions. Request repository context only when useful with \`context-route --task <current request>\` (local search by default); general research or host tasks need no repository retrieval. Use \`--retrieval semantic\` only when bounded paid selection is useful and existing disclosure policy permits it. Reuse the unchanged native packet with \`context-route --entry <id>\`; for requested evidence tied to that entry add \`--task <current request>\`. Exact originals use \`--optional-path <path>\`. Local retrieval consumes no paid continuation. When binding reports \`refresh-required\`, refresh current required context with \`context-route --task <current request> --retrieval none\`. Record observed later reads with \`telemetry context expansion --entry <id> --path <path>\`; absence of a record does not prove no reads. Normal checks and Git hooks inherit the binding. A provisional entry is not task acceptance.
For ordinary development, use focused checks and proportionate planning; do not invent additional approval or cadence gates. Shared-resource workflows use the installed \`workflow-bind\` entry; it follows the project's authorization mode (operator review unless the operator deliberately adopted task policy).
Before substantial builds or test batches, refresh that packet when scope changes, read its required test-execution guidance, and choose the cheapest reliable proof path.
When behavior changes, update its canonical explanation and public contract documentation. Use existing comment/document checks. Backfill older gaps when touching that area or correcting a retrieval miss; inspect the module overview first and avoid duplicated boilerplate. Context doctor reports observed gaps and checker coverage, not a repository-wide quality verdict.
Read shared skill discovery and referenced resources through \`skill-read --path catalog.yaml\` or a path relative to the packaged skills root.
If that installed command is unavailable, return the installation mismatch to the parent; do not silently fall back or bootstrap from a delegated worker.
<!-- harness-delegation:end -->`;
