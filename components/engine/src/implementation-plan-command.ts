import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { decodePlanBytes, parseImplementationPlan, planBytesDigest } from "./implementation-plan.ts";
import { parseSpecificationDeclaration, safeSpecificationPath, specificationDefinitionDigest } from "./specification-contract.ts";
import { inspectImplementationBatch, updateImplementationProgress, type PlanProgressRequest } from "./plan-progress.ts";
import { resolveChangeScope, ValidationSubject, worktreeBytes } from "./change-subject.ts";
import { loadSubjectPacks } from "./pack-configuration.ts";
import { narrativeFile } from "./narrative-inputs.ts";

export function implementationPlanCommand(args: string[], workspace: string, builtinDirectory = fileURLToPath(new URL("../assets/packs/", import.meta.url))) {
  const operation = args[0];
  const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: {
    path: { type: "string" }, batch: { type: "string" }, specification: { type: "string" }, request: { type: "string" }, staged: { type: "boolean" }, "base-ref": { type: "string" },
  } });
  if (values.specification) {
    if (operation !== "inspect" || values.path || values.batch || values.request || values.staged || values["base-ref"]) throw new Error("Specification inspection requires only its explicit path");
    const path = safeSpecificationPath(values.specification), bytes = worktreeBytes(realpathSync(workspace), path);
    if (bytes.type !== "regular") throw new Error("Ordinary specification required");
    const declaration = parseSpecificationDeclaration(bytes.bytes);
    if (!declaration) throw new Error("Structured specification required");
    return { version: 1, path, definition_digest: specificationDefinitionDigest(bytes.bytes), observed_file_digest: planBytesDigest(bytes.bytes), criteria: declaration.criteria };
  }
  if (!values.path || (values.staged && values["base-ref"])) throw new Error("Plan path and one candidate comparison are required");
  const root = realpathSync(workspace), bytes = worktreeBytes(root, values.path);
  if (bytes.type !== "regular") throw new Error("Ordinary implementation plan required");
  const plan = parseImplementationPlan(values.path, decodePlanBytes(bytes.bytes));
  if (operation === "inspect") {
    if (!values.batch || values.request || values.staged || values["base-ref"]) throw new Error("Inspection requires only path and batch");
    return inspectImplementationBatch(plan, values.batch);
  }
  if (operation !== "update" || !values.request || values.batch) throw new Error("Progress update requires a typed request file");
  const scope = resolveChangeScope(root, values.staged ? { staged: true } : { baseRef: values["base-ref"] ?? "HEAD" }), subject = new ValidationSubject(root, scope);
  const request = JSON.parse(narrativeFile(root, values.request)) as PlanProgressRequest;
  return updateImplementationProgress({ subject, scope, packs: loadSubjectPacks(subject, builtinDirectory), path: values.path, request });
}
