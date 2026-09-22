import { androidEmulatorAdapter, type AndroidEmulatorAdapter } from "./android-emulator.ts";
import { credentialNames } from "./credential-environment.ts";
import { isAbsolute, relative, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { digest, fileDigest, object, text } from "./core.ts";

export type StageState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "blocked" | "unknown";
export type RunState = "queued" | "running" | "reconciling" | "succeeded" | "failed" | "cancelled" | "blocked" | "unknown";
export interface InputFile { path: string; digest: string }
export interface Stage {
  id: string; operation: string; dependsOn: string[]; cleanup: boolean; deadlineMs: number;
}
export interface CommandOperation {
  argv: string[]; cwd: string; env: Record<string, string>; credentialEnv?: string[];
  terminationGraceMs?: number; expectedExitCodes: number[]; effect: "read" | "local";
}
export interface Recipe {
  version: 1; id: string; workspace: string; inputs: InputFile[]; resources: string[];
  operations: Record<string, CommandOperation>; stages: Stage[]; deadlineMs: number;
  policyRevision: string; claims: string[];
  androidEmulator?: AndroidEmulatorAdapter;
}
export interface RunBinding {
  taskId: string; taskVersion: number; actionId: string; authorityRef: string;
  recipe: Recipe; recipeDigest: string; operationId: string;
}
export interface StageResult {
  state: StageState; exitCode: number | null; cleanup: "confirmed" | "unknown";
  startedAt: string; endedAt: string; log: string; inputValidity: "valid" | "stale" | "unknown";
  detail: string;
  commandOutcome?: "unknown";
  cleanupRecovery?: { receiptDigest: string; recoveryDigest: string };
}

function strings(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be an array of at most ${max} items`);
  return value.map(v => text(v, label));
}
function positive(value: unknown, label: string, max = 86_400_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw new Error(`${label} is outside 1..${max}`);
  return value as number;
}
function fields(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unknown field ${key}`);
}

/** Recipes select host-reviewed operations; input text cannot introduce a new executable. */
export function parseRecipe(raw: unknown): Recipe {
  const value = object(raw, "recipe");
  fields(value, ["version", "id", "workspace", "inputs", "resources", "operations", "stages", "deadlineMs", "policyRevision", "claims", "androidEmulator"], "recipe");
  if (value["version"] !== 1) throw new Error("unsupported recipe version");
  const workspace = realpathSync(text(value["workspace"], "workspace"));
  const operations: Record<string, CommandOperation> = Object.create(null) as Record<string, CommandOperation>;
  for (const [id, rawOperation] of Object.entries(object(value["operations"], "operations"))) {
    text(id, "operation id", 128);
    const op = object(rawOperation, "operation");
    fields(op, ["argv", "cwd", "env", "expectedExitCodes", "effect", "credentialEnv", "terminationGraceMs"], "operation");
    const argv = strings(op["argv"], "argv", 256);
    if (!argv.length || !isAbsolute(argv[0]!)) throw new Error("operation executable must be absolute");
    const cwd = realpathSync(resolve(workspace, text(op["cwd"], "cwd")));
    const rel = relative(workspace, cwd);
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("operation cwd exceeds workspace");
    const env: Record<string, string> = {};
    for (const [key, val] of Object.entries(object(op["env"] ?? {}, "env"))) {
      if (key.startsWith("PROJECT_GOVERNANCE_WORKFLOW_")) throw new Error("workflow environment is engine-owned");
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof val !== "string" || val.includes("\0")) throw new Error("invalid environment entry");
      if (/TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY/i.test(key)) throw new Error("credentials cannot be embedded in recipes");
      env[key] = val;
    }
    const codes = op["expectedExitCodes"] ?? [0];
    if (!Array.isArray(codes) || !codes.length || codes.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error("invalid expected exit codes");
    if (op["effect"] !== "read" && op["effect"] !== "local") throw new Error("external effects require a separately qualified capability");
    operations[id] = { ...(op["terminationGraceMs"] === undefined ? {} : { terminationGraceMs: positive(op["terminationGraceMs"], "termination grace", 30000) }), argv, cwd, env, credentialEnv: credentialNames(op["credentialEnv"]), expectedExitCodes: codes as number[], effect: op["effect"] };
  }
  if (!Object.keys(operations).length || Object.keys(operations).length > 128) throw new Error("recipe requires 1..128 operations");
  if (!Array.isArray(value["stages"]) || !value["stages"].length || value["stages"].length > 128) throw new Error("recipe requires 1..128 stages");
  const seen = new Set<string>();
  const stages: Stage[] = value["stages"].map(rawStage => {
    const stage = object(rawStage, "stage"); fields(stage, ["id", "operation", "dependsOn", "cleanup", "deadlineMs"], "stage");
    const id = text(stage["id"], "stage id", 128), operation = text(stage["operation"], "stage operation", 128);
    const dependsOn = strings(stage["dependsOn"] ?? [], "stage dependencies", 128);
    if (seen.has(id) || dependsOn.some(d => !seen.has(d))) throw new Error("stage IDs must be unique and dependencies must precede their consumer");
    if (!Object.hasOwn(operations, operation)) throw new Error("stage selects an unregistered operation");
    if (stage["cleanup"] !== undefined && typeof stage["cleanup"] !== "boolean") throw new Error("cleanup must be boolean");
    seen.add(id);
    return { id, operation, dependsOn, cleanup: stage["cleanup"] === true, deadlineMs: positive(stage["deadlineMs"], "stage deadline") };
  });
  if (!Array.isArray(value["inputs"]) || value["inputs"].length > 100_000) throw new Error("bounded input manifest required");
  const paths = new Set<string>();
  const inputs = value["inputs"].map(rawInput => {
    const input = object(rawInput, "input"); fields(input, ["path", "digest"], "input");
    const path = text(input["path"], "input path"), hash = text(input["digest"], "input digest");
    const rel = relative(workspace, realpathSync(resolve(workspace, path)));
    if (isAbsolute(path) || rel === ".." || rel.startsWith("../") || paths.has(rel)) throw new Error("input outside workspace or duplicated");
    if (!/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error("invalid input digest");
    paths.add(rel); return { path: rel, digest: hash };
  });
  const androidEmulator = value.androidEmulator === undefined ? undefined : androidEmulatorAdapter(value.androidEmulator, workspace);
  if (androidEmulator && (!(value.resources as unknown[] ?? []).includes(`android-emulator:${androidEmulator.serial}`) ||
      (androidEmulator.capacity && !stages.some(stage => stage.id === androidEmulator.capacity!.beforeStage && !stage.cleanup))))
    throw new Error("Android adapter must bind its resource and a normal capacity stage");
  return { version: 1, id: text(value["id"], "recipe id"), workspace, inputs,
    ...(androidEmulator ? { androidEmulator } : {}),
    resources: strings(value["resources"] ?? [], "resources", 64), operations, stages,
    deadlineMs: positive(value["deadlineMs"], "workflow deadline"),
    policyRevision: text(value["policyRevision"], "policy revision"), claims: strings(value["claims"], "claims", 128) };
}

/** Before and after checks bind observed bytes, without pretending the manifest proves completeness. */
export function validateInputs(recipe: Recipe): boolean {
  return recipe.inputs.every(input => {
    try {
      const path = realpathSync(resolve(recipe.workspace, input.path));
      const rel = relative(recipe.workspace, path);
      if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return false;
      return fileDigest(path) === input.digest;
    } catch { return false; }
  });
}
export function recipeDigest(recipe: Recipe): string {
  // Object.create(null) lookup maps are normalized before canonical hashing.
  return digest(JSON.parse(JSON.stringify(recipe)));
}
