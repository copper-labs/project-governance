/** Reusable host approval bounds; every execution still needs a current task and exact action. */
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { digest, fileDigest, text } from "./core.ts";
import type { Recipe, CommandOperation, InputFile } from "./workflow-types.ts";

export interface WorkflowGrant {
  enrollmentId: string; sessionId: string; workspace: string; database: string;
  identity: { gitDirectory: string; branch: string; package: string; version: string;
    exportDigest: string; packageDigest: string; lockDigest: string; launcherDigest: string };
  policyRevision: string; operations: Record<string, CommandOperation>; resources: string[];
  inputRoots: string[]; immutableInputs: InputFile[]; requiredResources: Record<string, string[]>;
  maxRunMs: number; maxStageMs: number; expiresAt: string; receiptPath: string;
}
export interface WorkflowGrantRecord {
  id: string; revision: 1; grant: WorkflowGrant; grantDigest: string;
  issuedByTaskId: string; issuedByTaskVersion: number; createdAt: string;
  revokedAt: string | null; revocationAuthority: string | null;
}
const inside = (root: string, path: string): boolean => {
  const child = relative(root, path);
  return child === "" || (child !== ".." && !child.startsWith("../") && !isAbsolute(child));
};

/** Reject ambiguous bounds before the trusted host can persist an approval. */
export function validateWorkflowGrant(grant: WorkflowGrant, now = Date.now()): void {
  text(grant.enrollmentId, "workflow enrollment", 128); text(grant.sessionId, "workflow session", 256);
  if (realpathSync(grant.workspace) !== grant.workspace || realpathSync(grant.database) !== grant.database)
    throw new Error("Workflow grant paths must be canonical");
  if (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now ||
      Date.parse(grant.expiresAt) - now > 86_400_000) throw new Error("Workflow grant requires a future expiry within 24 hours");
  for (const limit of [grant.maxRunMs, grant.maxStageMs])
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 86_400_000) throw new Error("Invalid workflow grant time limit");
  if (!Array.isArray(grant.inputRoots) || !grant.inputRoots.length || grant.inputRoots.length > 256 ||
      grant.inputRoots.some(root => realpathSync(root) !== root || !inside(grant.workspace, root))) throw new Error("Invalid workflow input roots");
  if (!Array.isArray(grant.immutableInputs) || !grant.immutableInputs.length || grant.immutableInputs.length > 1000 ||
      new Set(grant.immutableInputs.map(input => input.path)).size !== grant.immutableInputs.length) throw new Error("Invalid workflow immutable guards");
  if (!Array.isArray(grant.resources) || grant.resources.length > 128 || new Set(grant.resources).size !== grant.resources.length)
    throw new Error("Invalid workflow grant resources");
  if (!grant.operations || !Object.keys(grant.operations).length || Object.keys(grant.operations).length > 128)
    throw new Error("Invalid workflow grant operations");
  for (const [id, op] of Object.entries(grant.operations)) {
    const executable = basename(op.argv?.[0] ?? "").toLowerCase();
    const shell = /^(?:sh|bash|dash|zsh|fish|ksh|csh|tcsh|pwsh|powershell)(?:\.exe)?$/.test(executable);
    const inline = op.argv?.slice(1).some(arg =>
      /^(?:node(?:js)?|bun)(?:\.exe)?$/.test(executable) && /^(?:-[ep].*|--(?:eval|print)(?:=.*)?|--import(?:=.*)?)$/.test(arg)
      || executable === "deno" && arg === "eval"
      || /^python[0-9.]*(?:\.exe)?$/.test(executable) && /^-[^-]*c/.test(arg)
      || /^(?:ruby|perl)(?:\.exe)?$/.test(executable) && /^-[^-]*[eE]/.test(arg));
    if (!Array.isArray(op.argv) || !isAbsolute(op.argv[0] ?? "") || !["read", "local"].includes(op.effect) || shell || inline)
      throw new Error("Unrestricted shell/eval is not a reusable workflow operation");
    if (!inside(grant.workspace, realpathSync(op.cwd)) || !Array.isArray(grant.requiredResources[id]) ||
        grant.requiredResources[id]!.some(resource => !grant.resources.includes(resource))) throw new Error("Invalid workflow operation scope/resources");
  }
  for (const guard of grant.immutableInputs) {
    const path = realpathSync(resolve(grant.workspace, guard.path));
    if (isAbsolute(guard.path) || !inside(grant.workspace, path) || fileDigest(path) !== guard.digest)
      throw new Error("Workflow grant guard changed or escaped worktree");
  }
}

/** Recheck the selected installation and worktree, rather than trusting an old receipt's identity. */
export function validateWorkflowGrantIdentity(grant: WorkflowGrant): void {
  const id = grant.identity;
  const git = (...args: string[]): string => execFileSync("/usr/bin/git", ["-C", grant.workspace, ...args], { encoding: "utf8", timeout: 5000 }).trim();
  if (git("rev-parse", "--show-toplevel") !== grant.workspace || git("rev-parse", "--absolute-git-dir") !== id.gitDirectory ||
      git("branch", "--show-current") !== id.branch ||
      realpathSync(join(git("rev-parse", "--path-format=absolute", "--git-common-dir"), "harness/harness.db")) !== grant.database)
    throw new Error("Workflow grant worktree identity changed");
  // Source tests and the compiled runtime both locate their owning package. A
  // different installed runtime may not execute a grant merely by reading it.
  let owner = dirname(fileURLToPath(import.meta.url));
  while (dirname(owner) !== owner) {
    try {
      const manifest = JSON.parse(readFileSync(join(owner, "package.json"), "utf8"));
      if (manifest.name === "@organta/project-governance") break;
    } catch { /* Walk to the package owner, not a project selected by the caller. */ }
    owner = dirname(owner);
  }
  if (realpathSync(owner) !== realpathSync(id.package)) throw new Error("Workflow grant runtime owner changed");
  const manifest = JSON.parse(readFileSync(join(id.package, "package.json"), "utf8"));
  const entry = manifest.exports?.["./host/v1"]?.import;
  const pin = join(grant.workspace, "config/governance/runtime.lock.yaml"), launcher = join(grant.workspace, ".governance/runtime/bin/project-governance");
  if (manifest.version !== id.version || typeof entry !== "string" || !inside(id.package, realpathSync(resolve(id.package, entry))) ||
      fileDigest(resolve(id.package, entry)) !== id.exportDigest || fileDigest(join(id.package, "package.json")) !== id.packageDigest ||
      fileDigest(pin) !== id.lockDigest || fileDigest(launcher) !== id.launcherDigest) throw new Error("Workflow grant runtime identity changed");
}

/** Applied again before dispatch and each ordinary stage; cleanup uses the existing independent path. */
export function validateWorkflowGrantUse(record: WorkflowGrantRecord, recipe: Recipe, session: string | null, now = Date.now(), checkFiles = true): void {
  const grant = record.grant;
  if (record.revokedAt || Date.parse(grant.expiresAt) <= now) throw new Error("Workflow grant revoked or expired");
  if (record.grantDigest !== digest(grant)) throw new Error("Workflow grant identity changed");
  if (recipe.workspace !== grant.workspace || session !== grant.sessionId || recipe.policyRevision !== grant.policyRevision)
    throw new Error("Workflow grant session/workspace/policy changed");
  if (checkFiles) validateWorkflowGrantIdentity(grant);
  if (recipe.deadlineMs > grant.maxRunMs || recipe.stages.some(stage => stage.deadlineMs > grant.maxStageMs)) throw new Error("Workflow grant time limit exceeded");
  for (const [id, operation] of Object.entries(recipe.operations)) {
    if (!Object.hasOwn(grant.operations, id) || digest(operation) !== digest(grant.operations[id]) ||
        grant.requiredResources[id]!.some(resource => !recipe.resources.includes(resource))) throw new Error("Operation is outside workflow grant");
  }
  if (recipe.resources.some(resource => !grant.resources.includes(resource))) throw new Error("Resource is outside workflow grant");
  if (checkFiles) for (const input of recipe.inputs)
    if (!grant.inputRoots.some(root => inside(root, realpathSync(join(recipe.workspace, input.path))))) throw new Error("Input is outside workflow grant");
  for (const guard of grant.immutableInputs) {
    if (!recipe.inputs.some(input => input.path === guard.path && input.digest === guard.digest))
      throw new Error("Workflow grant guard changed or omitted");
    if (checkFiles) {
      const target = realpathSync(join(recipe.workspace, guard.path));
      if (!inside(recipe.workspace, target) || fileDigest(target) !== guard.digest) throw new Error("Workflow grant guard changed or omitted");
    }
  }
}
