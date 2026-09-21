import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { parseRecipe, type Recipe } from "./workflow-types.ts";
import { createHash } from "node:crypto";
import type { ValidationSubject } from "./change-subject.ts";

export const OPERATION_CATALOG = "config/governance/operations.json";

/** Project configuration defines executable operations; submitted recipes only select their IDs. */
export function resolveWorkflowRecipe(raw: unknown, subject?: ValidationSubject): Recipe {
  const value = object(raw, "workflow recipe");
  if (Object.hasOwn(value, "operations")) throw new Error("Submitted recipes cannot define operations; use the project operation catalog");
  const workspace = realpathSync(text(value["workspace"], "workspace"));
  if (subject && realpathSync(subject.root) !== workspace) throw new Error("Recipe differs from captured workspace");
  const catalogPath = resolve(workspace, OPERATION_CATALOG);
  if (!subject && realpathSync(catalogPath) !== catalogPath) throw new Error("Operation catalog must not use symlinks");
  if (subject && subject.source(OPERATION_CATALOG)?.file_type !== "regular") throw new Error("Captured operation catalog unavailable");
  const source = subject ? new TextDecoder("utf-8", { fatal: true }).decode(subject.read(OPERATION_CATALOG, 1024 * 1024)) : narrativeFile(workspace, OPERATION_CATALOG);
  const catalog = object(JSON.parse(source), "operation catalog");
  if (catalog["version"] !== 1 || Object.keys(catalog).some(key => !["version", "operations"].includes(key))) {
    throw new Error("Unsupported operation catalog");
  }
  const available = object(catalog["operations"], "catalog operations");
  if (!Array.isArray(value["stages"])) throw new Error("Workflow stages required");
  const operations: Record<string, unknown> = Object.create(null);
  for (const rawStage of value["stages"]) {
    const id = text(object(rawStage, "stage")["operation"], "operation id", 128);
    if (!Object.hasOwn(available, id)) throw new Error(`Operation is not in the project catalog: ${id}`);
    operations[id] = available[id];
  }
  const inputs = value["inputs"];
  if (!Array.isArray(inputs)) throw new Error("Workflow inputs required");
  if (inputs.some(input => object(input, "input")["path"] === OPERATION_CATALOG)) {
    throw new Error("Operation catalog input binding is engine-owned");
  }
  const recipe = parseRecipe({ ...value, workspace, operations, inputs: [...inputs,
    { path: OPERATION_CATALOG, digest: `sha256:${createHash("sha256").update(source).digest("hex")}` }] });
  return recipe;
}
