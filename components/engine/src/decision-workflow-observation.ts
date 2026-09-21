import { attentionAdvice } from "./decision-attention.ts";
import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { workflowCommand } from "./workflow-command.ts";
import { workflowWaitCommand } from "./workflow-wait.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { deviceAdvice, parseDiagnosticEvidence } from "./decision-device-advice.ts";
import { readPilotAssignment, recordDecisionEpisode } from "./decision-episodes.ts";
import { resolve } from "node:path";
import type { DecisionOptions } from "./decisions.ts";

/** Native observation completes first. Optional interpretation cannot execute or change its result. */
export async function workflowObservationCommand(command: "workflow-status" | "workflow-wait", args: string[], cancellation: DecisionOptions = {}) {
  const startedAt = Date.now();
  const nativeNames = ["database", "run", ...(command === "workflow-wait" ? ["wait-ms", "after-event"] : [])];
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: Object.fromEntries(
    [...nativeNames, "diagnostic-evidence", "decision-task", "decision-revision", "pilot-assignment", "attention-evidence"].map(name => [name, { type: "string" as const }])) });
  const nativeArgs = nativeNames.flatMap(name => values[name] === undefined ? [] : [`--${name}`, values[name]!]);
  const native = command === "workflow-wait" ? await workflowWaitCommand(nativeArgs) : workflowCommand(command, nativeArgs);
  let collection: { workspace: string; selected: ReturnType<typeof readPilotAssignment> } | null = null;
  let collectionFailed = false;
  if (values["pilot-assignment"]) {
    try {
      const workspace = realpathSync(native.run.binding.recipe.workspace);
      const scope = resolveDecisionScope(workspace, {}, { workspace, taskId: native.run.binding.taskId, revision: String(native.run.binding.taskVersion) })!;
      collection = { workspace, selected: readPilotAssignment(resolve(workspace, values["pilot-assignment"]), scope, startedAt) };
    } catch { collectionFailed = true; }
  }
  let capturedSettings: ReturnType<typeof loadProfileDecisionSettings> | null = null;
  const observe = async () => {
  try {
    const workspace = realpathSync(native.run.binding.recipe.workspace);
    const settings = loadProfileDecisionSettings(workspace);
    capturedSettings = settings;
    if (settings.mode === "off") return native;
    let scope: ReturnType<typeof resolveDecisionScope>;
    try {
      scope = resolveDecisionScope(workspace, { ...(values["decision-task"] ? { taskId: values["decision-task"] } : {}), ...(values["decision-revision"] ? { revision: values["decision-revision"] } : {}) },
        { workspace, taskId: native.run.binding.taskId, revision: String(native.run.binding.taskVersion) });
    } catch { return { ...native, deviceAdvice: { reason: "decision-scope-conflict", delivered: false } }; }
    const runtime = new DecisionRuntime(settings, contextStateRoot(workspace), cancellation);
    const envelope = runtime.eligibility("DL05").mode !== "off" && values["diagnostic-evidence"] ? parseDiagnosticEvidence(JSON.parse(narrativeFile(workspace, values["diagnostic-evidence"]!))) : null;
    const stages = "stages" in native ? native.stages : [];
    const advice = runtime.eligibility("DL05").mode === "off" ? null : await deviceAdvice(runtime, native.run, stages, envelope, scope,
      { policyDigest: settings.configDigest, environment: "workflow-observation" });
    const attention = command === "workflow-wait" && runtime.eligibility("DL06").mode !== "off" ? await attentionAdvice(runtime,
      { run: native.run, stages, events: "events" in native ? native.events : [] },
      values["attention-evidence"] ? JSON.parse(narrativeFile(workspace, values["attention-evidence"])) : null, scope) : null;
    if (!advice && !attention) return native;
    const store = new WorkflowStore(values.database!);
    try {
      if (digest(store.read(native.run.id)) !== digest(native.run) || digest(store.stages(native.run.id)) !== digest(stages))
        return { ...native, deviceAdvice: { reason: "observation-changed", delivered: false } };
    } finally { store.close(); }
    return { ...native, ...(advice ? { deviceAdvice: advice } : {}), ...(attention ? { attentionAdvice: attention } : {}) };
  } catch {
    return { ...native, deviceAdvice: { reason: "advice-unavailable-or-stale", delivered: false } };
  }
  };
  const result = await observe();
  if (!values["pilot-assignment"]) return result;
  if (collectionFailed || !collection) return { ...result, collection: { status: "failed", reason: "assignment-invalid-or-unavailable" } };
  try {
    const advice = "deviceAdvice" in result ? result.deviceAdvice : null;
    const decision = advice && "decision" in advice && advice.decision ? object(advice.decision) : null;
    const attention = "attentionAdvice" in result && result.attentionAdvice ? object(result.attentionAdvice) : null;
    const events = "events" in native ? native.events : [];
    const settings = capturedSettings as ReturnType<typeof loadProfileDecisionSettings> | null;
    const receipt = recordDecisionEpisode(contextStateRoot(collection.workspace), { ...collection.selected,
      caller: command, entryKind: "workflow-observe",
      native: { runId: native.run.id, runDigest: digest(native.run), stagesDigest: digest(native.stages),
        eventIds: events.map(event => Number(object(event).sequence)), eventsDigest: digest(events) },
      exposure: { mode: advice && "mode" in advice ? advice.mode : attention?.mode ?? (advice ? "unknown" : "off"), configuredMode: settings?.mode ?? "unknown",
        effect: "advise", configuredEffect: settings?.consumers.DL05.effect ?? "unknown",
        delivered: (advice?.delivered ?? false) || attention?.delivered === true, reason: advice?.reason ?? attention?.reason ?? "off", hostCapability: "workflow-observation",
        elapsedMs: Date.now() - startedAt, attention }, decisions: [...(typeof decision?.receiptId === "string" ? [decision.receiptId] : []), ...(typeof attention?.receiptId === "string" ? [attention.receiptId] : [])] });
    return { ...result, collection: receipt };
  } catch (error) { return { ...result, collection: { status: "failed", reason:
    error instanceof Error && error.message === "episode-id-already-used" ? "episode-id-already-used" : "episode-recording-unavailable" } }; }
}
