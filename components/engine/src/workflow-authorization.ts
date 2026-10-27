import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { digest, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { credentialNames } from "./credential-environment.ts";
import type { Recipe } from "./workflow-types.ts";

export interface WorkflowAuthorization {
  mode: "operator" | "task";
  resources: string[];
  credentialEnv: string[];
  digest: string;
}

/** A project policy declaration, not authenticated consent or subprocess containment. */
export function workflowAuthorization(workspace: string): WorkflowAuthorization {
  const root = realpathSync(workspace), path = "config/governance/profile.yaml";
  let profile: Record<string, unknown> = {};
  try {
    const source = narrativeFile(root, path);
    if (realpathSync(resolve(root, path)) !== resolve(root, path)) throw new Error("Workflow profile must not use symlinks");
    let parsed: unknown;
    try { parsed = parse(source); } catch { throw new Error("Invalid project profile YAML"); }
    profile = object(parsed ?? {}, "project profile");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const declaration = profile.workflow_authorization === undefined ? { mode: "operator" } : object(profile.workflow_authorization, "workflow authorization");
  if (Object.keys(declaration).some(key => !["mode", "resources", "credential_env"].includes(key))) throw new Error("Unknown workflow authorization field");
  if (declaration.mode !== "operator" && declaration.mode !== "task") throw new Error("Workflow authorization mode must be operator or task");
  const raw = declaration.resources === undefined ? [] : declaration.resources;
  if (!Array.isArray(raw) || raw.length > 128) throw new Error("Workflow resources must be a bounded list");
  const resources = raw.map(value => text(value, "workflow resource", 256));
  if (new Set(resources).size !== resources.length) throw new Error("Duplicate workflow resource");
  const credentialEnv = credentialNames(declaration.credential_env);
  if (declaration.mode === "operator" && (resources.length || credentialEnv.length)) throw new Error("Operator mode does not declare task workflow permissions");
  const policy: Omit<WorkflowAuthorization, "digest"> = { mode: declaration.mode, resources: resources.sort(), credentialEnv: credentialEnv.sort() };
  return { ...policy, digest: digest(policy) };
}

/** Existing task authority still decides scope; this checks only declared extra capabilities. */
export function assertWorkflowAuthorization(policy: WorkflowAuthorization, recipe: Recipe): void {
  if (policy.mode !== "task") throw new Error("Task workflow authorization is not configured");
  if (recipe.resources.some(resource => !policy.resources.includes(resource))) throw new Error("Workflow resource is outside the configured task policy");
  for (const operation of Object.values(recipe.operations)) {
    if (!["read", "local"].includes(operation.effect)) throw new Error("Task workflow policy permits only local operations");
    if ((operation.credentialEnv ?? []).some(name => !policy.credentialEnv.includes(name))) throw new Error("Workflow credential is outside the configured task policy");
  }
}
