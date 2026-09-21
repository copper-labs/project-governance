import { backedMigrationInputs } from "./backed-migration-inputs.ts";
import { declaredBackupInputs } from "./runtime-maintenance-command.ts";
import { parseArgs } from "node:util";
import { completeRuntimeTransition } from "./runtime-transition.ts";
import { completeHostInstructionTransition } from "./host-instruction-transition.ts";
import { forwardRepairRuntime } from "./runtime-forward-repair.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { digest, object } from "./core.ts";
import type { planHostInstructions } from "./host-instruction-plan.ts";

/** Parse persisted plans before entering maintenance or touching installation files. */
export function readHostTransitionPlan(path: string) {
  const envelope = object(JSON.parse(narrativeFile(process.cwd(), path)));
  const plan = object(envelope.plan);
  if (Object.keys(envelope).some(key => !["plan", "planDigest", "inputs"].includes(key)) ||
      plan.version !== 1 || plan.kind !== "host-instruction-plan" || typeof plan.workspace !== "string" ||
      !Array.isArray(plan.entries) || !Array.isArray(plan.writes) || plan.entries.length > 4 || plan.writes.length > 4 ||
      Object.keys(plan).some(key => !["version", "kind", "workspace", "entries", "writes"].includes(key))) throw new Error("Invalid saved host instruction plan");
  for (const raw of plan.entries) {
    const entry = object(raw);
    if (Object.keys(entry).sort().join() !== "active,name,target" || typeof entry.name !== "string" || typeof entry.target !== "string" || typeof entry.active !== "boolean") throw new Error("Invalid saved host entry");
  }
  for (const raw of plan.writes) {
    const write = object(raw);
    if (Object.keys(write).sort().join() !== "beforeDigest,content,mode,path" || typeof write.path !== "string" || typeof write.content !== "string" ||
        (write.beforeDigest !== null && (typeof write.beforeDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(write.beforeDigest))) ||
        !Number.isInteger(write.mode) || Number(write.mode) < 0 || Number(write.mode) > 0o777) throw new Error("Invalid saved host write");
  }
  if (new Set(plan.writes.map(raw => object(raw).path)).size !== plan.writes.length || envelope.planDigest !== digest(plan)) throw new Error("Saved host instruction plan digest differs");
  return plan as ReturnType<typeof planHostInstructions>;
}

export async function runtimeCompletionCommand(args: string[]) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    registry: { type: "string" }, workspace: { type: "string" }, candidate: { type: "string" },
    backup: { type: "string" }, token: { type: "string" }, owner: { type: "string" },
    file: { type: "string", multiple: true }, sqlite: { type: "string", multiple: true }, absent: { type: "string", multiple: true },
    "project-plan": { type: "string" }, "startup-receipts": { type: "string" },
    "forward-repair": { type: "boolean" }, "host-plan": { type: "string" },
    "history-archive": { type: "string" }, "history-digest": { type: "string" },
  } });
  if (!values.registry || !values.workspace || !values.candidate || !values.backup || !values.token || !values.owner) throw new Error("Registry, workspace, candidate, backup, token and owner required");
  if(values["startup-receipts"] && !values["host-plan"])throw new Error("Startup receipts require a host transition plan");
  if (values["forward-repair"] && values["host-plan"]) throw new Error("Preserving forward repair cannot also change host instructions");
  if (Boolean(values["history-archive"]) !== Boolean(values["history-digest"])) throw new Error("History archive and digest required together");
  const history = values["history-archive"] ? {directory:values["history-archive"],receiptDigest:values["history-digest"]!} : undefined;
  const inputs = [...(values["project-plan"] ? backedMigrationInputs(values["project-plan"],values.backup,values.workspace) : []), ...declaredBackupInputs(values)];
  if (values["host-plan"]) {
    const plan = readHostTransitionPlan(values["host-plan"]);
    return completeHostInstructionTransition(values.registry, values.workspace, values.candidate, values.backup, inputs,
      values.token, values.owner, plan, COMPILED_HOST_BLOCK, history,values["startup-receipts"]);
  }
  const complete = values["forward-repair"] ? forwardRepairRuntime : completeRuntimeTransition;
  return complete(values.registry, values.workspace, values.candidate, values.backup, inputs, values.token, values.owner, history);
}
