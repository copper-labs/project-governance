import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { providerRuntime } from "./provider-runtime.ts";
import { providerGuidance, COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { installHostInstructions } from "./host-instruction-installation.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { narrativeFile } from "./narrative-inputs.ts";

/** Install a route only when both its pinned runtime and stable project launcher are verified. */
export function hostInstructionCommand(args: string[], workspace: string) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    "dry-run": { type: "boolean" }, "plan-digest": { type: "string" },
  } });
  const binding = providerRuntime(workspace);
  if (!binding) throw new Error("Host instruction installation requires an installed project runtime");
  providerGuidance();
  const launcher = join(binding.root, ".governance/runtime/bin/project-governance");
  const executable = join(binding.directory, "node_modules/@organta/project-governance/dist/engine/src/cli.js");
  if (realpathSync(launcher) !== launcher || narrativeFile(binding.root, launcher) !== runtimeLauncher(realpathSync(process.execPath), executable, binding.registry, binding.root)) throw new Error("Host instruction launcher differs from installed runtime");
  return installHostInstructions(binding.root, COMPILED_HOST_BLOCK, {
    dryRun: values["dry-run"] ?? false, ...(values["plan-digest"] ? { expectedPlanDigest: values["plan-digest"] } : {}),
  });
}
