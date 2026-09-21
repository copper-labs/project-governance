import { realpathSync } from "node:fs";
import { digest, object, text } from "./core.ts";
import { resolveWorkflowRecipe } from "./workflow-catalog.ts";
import { recipeDigest } from "./workflow-types.ts";
import type { WorkflowRun } from "./workflow-store.ts";
import type { DiagnosticProbe } from "./diagnostic-types.ts";

export interface DiagnosticManifest {
  version: 1; parentRunId: string; stageId: string; deadline: number;
  target: { kind: "workspace" | "ios-simulator"; id: string };
  probes: Array<{ id: string; description: string; recipe: unknown; binding: { actionId: string; authorityRef: string; operationId: string } }>;
  baseline: { revision: string; probeOrder: string[]; exact?: boolean };
}

/** Parent/stage identity prevents a catalog edit from refreshing the same episode's allowance. */
export function diagnosticEpisodeId(parent: WorkflowRun, stageId: string): string {
  return digest({ workspace: parent.binding.recipe.workspace, task: parent.binding.taskId, revision: parent.binding.taskVersion, parent: parent.id, stage: stageId }).slice(7);
}
export function diagnosticOperationId(episode: string, probe: string): string { return `diagnostic:${episode}:${probe}`; }

/** Resolve a bounded reviewed catalog. Neither arbitrary commands nor grants can arrive from JEV. */
export function resolveDiagnosticManifest(raw: unknown, parent: WorkflowRun) {
  const input = object(raw, "probe manifest");
  for (const key of Object.keys(input)) if (!["version", "parentRunId", "stageId", "deadline", "target", "probes", "baseline"].includes(key)) throw new Error("Unknown probe manifest field");
  if (input.version !== 1 || input.parentRunId !== parent.id || !Number.isSafeInteger(input.deadline) || (input.deadline as number) < 1) throw new Error("Diagnostic manifest requires parent and absolute deadline");
  const stageId = text(input.stageId, "diagnostic stage", 128), id = diagnosticEpisodeId(parent, stageId);
  const target = object(input.target);
  if (!["workspace", "ios-simulator"].includes(String(target.kind))) throw new Error("Unsupported diagnostic target adapter");
  const targetId = text(target.id, "diagnostic target", 4096);
  if (target.kind === "workspace" && realpathSync(targetId) !== parent.binding.recipe.workspace) throw new Error("Diagnostic workspace mismatch");
  if (target.kind === "ios-simulator" && (!/^[0-9A-Fa-f-]{36}$/u.test(targetId) || !parent.binding.recipe.resources.includes(`ios-simulator:${targetId}`))) throw new Error("Diagnostic simulator differs from parent binding");
  if (!Array.isArray(input.probes) || input.probes.length < 1 || input.probes.length > 8) throw new Error("Diagnostic manifest requires 1..8 probes");
  const ids = new Set<string>(), actions = new Set<string>();
  const probes: DiagnosticProbe[] = input.probes.map(rawProbe => {
    const probe = object(rawProbe), probeId = text(probe.id, "probe id", 64);
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(probeId) || ids.has(probeId)) throw new Error("Invalid or duplicate diagnostic probe ID");
    ids.add(probeId);
    const recipe = resolveWorkflowRecipe(probe.recipe), approval = object(probe.binding);
    const actionId = text(approval.actionId, "probe action", 256), operationId = text(approval.operationId, "probe operation", 256);
    if (actionId === parent.binding.actionId || actions.has(actionId) || operationId !== diagnosticOperationId(id, probeId)) throw new Error("Each probe requires a distinct preauthorized action and stable operation");
    actions.add(actionId);
    if (recipe.workspace !== parent.binding.recipe.workspace || recipe.policyRevision !== parent.binding.recipe.policyRevision ||
        Object.values(recipe.operations).some(op => op.effect !== "read")) throw new Error("Diagnostic recipes must be local read-only operations in the parent's scope");
    return { id: probeId, description: text(probe.description, "probe description", 1000), binding: {
      taskId: parent.binding.taskId, taskVersion: parent.binding.taskVersion, actionId,
      authorityRef: text(approval.authorityRef, "host probe authority", 256), operationId, recipe, recipeDigest: recipeDigest(recipe),
    } };
  });
  const baseline = object(input.baseline);
  text(baseline.revision, "baseline runbook revision", 256);
  if (baseline.exact !== undefined && typeof baseline.exact !== "boolean") throw new Error("Runbook exact flag must be boolean");
  if (!Array.isArray(baseline.probeOrder) || baseline.probeOrder.length > 3 || new Set(baseline.probeOrder).size !== baseline.probeOrder.length ||
      baseline.probeOrder.some(value => !ids.has(String(value)))) throw new Error("Invalid code-only runbook order");
  const targetBinding = { kind: target.kind as "workspace" | "ios-simulator", id: targetId };
  const catalogDigest = digest({ probes, baseline, target: targetBinding });
  return { id, stageId, target: targetBinding, probes, baselineOrder: baseline.probeOrder as string[], exactBaseline: baseline.exact === true,
    deadline: input.deadline as number, catalogDigest, requestDigest: digest({ parent: parent.id, stageId, catalogDigest, deadline: input.deadline }) };
}
