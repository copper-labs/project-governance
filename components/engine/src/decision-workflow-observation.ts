import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { workflowCommand } from "./workflow-command.ts";
import { workflowWaitCommand } from "./workflow-wait.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { deviceAdvice, parseDiagnosticEvidence } from "./decision-device-advice.ts";
import type { DecisionOptions } from "./decisions.ts";

/** Native observation completes first. Optional interpretation cannot execute or change its result. */
export async function workflowObservationCommand(command: "workflow-status" | "workflow-wait", args: string[], cancellation: DecisionOptions = {}) {
  const nativeNames = ["database", "run", ...(command === "workflow-wait" ? ["wait-ms", "after-event"] : [])];
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: Object.fromEntries(
    [...nativeNames, "diagnostic-evidence", "decision-task", "decision-revision"].map(name => [name, { type: "string" as const }])) });
  const nativeArgs = nativeNames.flatMap(name => values[name] === undefined ? [] : [`--${name}`, values[name]!]);
  const native = command === "workflow-wait" ? await workflowWaitCommand(nativeArgs) : workflowCommand(command, nativeArgs);
  try {
    const workspace = realpathSync(native.run.binding.recipe.workspace);
    const settings = loadProfileDecisionSettings(workspace);
    if (settings.mode === "off") return native;
    const scope = resolveDecisionScope(workspace, { ...(values["decision-task"] ? { taskId: values["decision-task"] } : {}), ...(values["decision-revision"] ? { revision: values["decision-revision"] } : {}) },
      { workspace, taskId: native.run.binding.taskId, revision: String(native.run.binding.taskVersion) });
    const runtime = new DecisionRuntime(settings, contextStateRoot(workspace), cancellation);
    if (runtime.eligibility("DL05").mode === "off") return native;
    const envelope = values["diagnostic-evidence"] ? parseDiagnosticEvidence(JSON.parse(narrativeFile(workspace, values["diagnostic-evidence"]!))) : null;
    const stages = "stages" in native ? native.stages : [];
    const advice = await deviceAdvice(runtime, native.run, stages, envelope, scope,
      { policyDigest: settings.configDigest, environment: "workflow-observation" });
    const store = new WorkflowStore(values.database!);
    try {
      if (digest(store.read(native.run.id)) !== digest(native.run) || digest(store.stages(native.run.id)) !== digest(stages))
        return { ...native, deviceAdvice: { reason: "observation-changed", delivered: false } };
    } finally { store.close(); }
    return { ...native, deviceAdvice: advice };
  } catch {
    return { ...native, deviceAdvice: { reason: "advice-unavailable-or-stale", delivered: false } };
  }
}
