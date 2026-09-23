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
When delegation is authorized, run that runtime's \`provider-help\` and follow its assignment, observation and cleanup contract unless the operator explicitly selects another route.
At top-level development task entry, create or deliberately resume this session's continuity task with that runtime's \`harness task create --outcome <goal> --acceptance <criterion> --scope <relevant path>\` or \`harness resume --task <id>\`. Keep the binding for the task; do not create new tasks for retries. Subagents use their captured assignment and never rebind the parent's session.
Before task-specific source or documentation reads, use \`context-route\` under that binding and read its returned required guidance and selected evidence. Expand from original references or the project index when the packet is incomplete. Normal checks and Git hooks inherit the same task. If binding is unavailable, report the named integration gap and use explicit context; a startup child cannot set its parent's environment.
Before substantial builds or test batches, refresh that packet when scope changes, read its required test-execution guidance, and choose the cheapest reliable proof path.
Read shared skill discovery and referenced resources through \`skill-read --path catalog.yaml\` or a path relative to the packaged skills root.
If that installed command is unavailable, return the installation mismatch to the parent; do not silently fall back or bootstrap from a delegated worker.
<!-- harness-delegation:end -->`;
