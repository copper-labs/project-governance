import { readCurrentMigrationPlan } from "./runtime-migration-plan.ts";
import { lstatSync } from "node:fs";
import { parseArgs } from "node:util";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { backupRuntimeState, type BackupInput } from "./runtime-backup.ts";
import { text } from "./core.ts";

export function declaredBackupInputs(values: {file?: string[]; sqlite?: string[]; absent?: string[]}): BackupInput[] {
  return [...(values.file ?? []).map(path => ({ path, kind: "file" as const })),
    ...(values.sqlite ?? []).map(path => ({ path, kind: "sqlite" as const })),
    ...(values.absent ?? []).map(path => ({ path, kind: "absent" as const }))];
}

function requireExistingRegistry(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("An existing ordinary generation registry is required");
}

/** Expose the existing owned maintenance boundary; it is not evidence that legacy writers drained. */
export async function runtimeMaintenanceCommand(command: "runtime-maintenance" | "runtime-backup", args: string[]) {
  const names = command === "runtime-backup" ? ["registry", "token", "owner", "destination", "project-plan"] : ["registry", "action", "token", "owner", "revision", "operation-token"];
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    ...Object.fromEntries(names.map(name => [name, { type: "string" as const }])),
    ...(command === "runtime-backup" ? Object.fromEntries(["file", "sqlite", "absent"].map(name => [name, { type: "string" as const, multiple: true }])) : {}),
  } });
  const registry = text(values.registry, "registry"), owner = text(values.owner, "maintenance owner");
  if (command === "runtime-backup") {
    const token = text(values.token, "maintenance token"), destination = text(values.destination, "backup destination");
    requireExistingRegistry(registry);
    const planPath = values["project-plan"] === undefined ? null : text(values["project-plan"], "project migration plan");
    const plan = planPath ? readCurrentMigrationPlan(planPath) : null;
    const inputs = [...(plan?.inputs ?? []), ...declaredBackupInputs(values as {file?:string[];sqlite?:string[];absent?:string[]})];
    return backupRuntimeState(registry, token, owner, inputs, destination, planPath ? () => { readCurrentMigrationPlan(planPath, plan!.planDigest); } : undefined);
  }
  const action = text(values.action, "maintenance action");
  if (!["begin", "end"].includes(action)) throw new Error("Maintenance action must be begin or end");
  if (action === "begin" && (values.token !== undefined || typeof values.revision !== "string" || !/^\d+$/u.test(values.revision) || !Number.isSafeInteger(Number(values.revision))))
    throw new Error("Begin requires a nonnegative expected revision and no existing token");
  if (values["operation-token"] !== undefined && (action !== "begin" || typeof values["operation-token"] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(values["operation-token"]))) throw new Error("Begin operation token must be a UUID v4");
  if (action === "end" && (values.revision !== undefined || typeof values.token !== "string" || !values.token.trim()))
    throw new Error("End requires a token and no revision");
  if (action === "end" || Number(values.revision) !== 0) requireExistingRegistry(registry);
  const generations = new RuntimeGenerations(registry);
  try {
    if (action === "begin") return { state: "maintenance", ...generations.beginMaintenance(owner, Number(values.revision),values["operation-token"] as string | undefined) };
    generations.endMaintenance(String(values.token), owner);
    return { state: "maintenance-ended", owner };
  } finally { generations.close(); }
}
