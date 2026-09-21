import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { digest } from "./core.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";

/** Bind delegated native work to the destination's selected installed engine, without bootstrapping it. */
export function providerRuntime(workspace: string, environment: NodeJS.ProcessEnv = process.env,
  implementation = fileURLToPath(import.meta.url)) {
  workspace = realpathSync(workspace);
  let root: string | null = null;
  for (let path = workspace;; path = dirname(path)) {
    if (existsSync(join(path, "config/governance/runtime.lock.yaml"))) { root = path; break; }
    if (dirname(path) === path) break;
  }
  const registry = environment.GOVERNANCE_GENERATION_REGISTRY;
  const token = environment.GOVERNANCE_GENERATION_TOKEN;
  const owner = environment.GOVERNANCE_GENERATION_OWNER;
  if (environment.GOVERNANCE_PARENT_LOCK_DIGEST || environment.GOVERNANCE_PARENT_TASK) throw new Error("Legacy parent runtime identity cannot authorize a compiled provider job; return to the parent runtime");
  if (!root && !registry && !token && !owner) return null;
  if (!root || !registry || !token || !owner) throw new Error("Delegated work requires the destination's installed runtime and complete parent generation identity");
  const lockPath = join(root, "config/governance/runtime.lock.yaml");
  if (realpathSync(lockPath) !== lockPath) throw new Error("Provider destination lock cannot use a symlink");
  const lock = compiledRuntimeLock(parse(narrativeFile(root, "config/governance/runtime.lock.yaml")));
  if (!existsSync(registry)) throw new Error("Provider parent generation registry is missing");
  const generations = new RuntimeGenerations(registry);
  try {
    const state = generations.state();
    if (state.maintenance || !state.directory || !state.readers.some(reader => reader.token === token && reader.owner === owner && reader.revision === state.revision)) throw new Error("Current provider parent generation reader required");
    const installed = inspectRuntimeGeneration(state.directory);
    if (installed.lockDigest !== digest(lock)) throw new Error("Provider destination lock differs from parent runtime");
    const moduleRoot = join(installed.directory, "node_modules/@organta/project-governance/dist/engine/src");
    const path = relative(moduleRoot, realpathSync(implementation));
    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path)) throw new Error("Provider helper does not belong to the destination's installed runtime");
    return { root, lockDigest: digest(lock), registry: realpathSync(registry), revision: state.revision, directory: installed.directory };
  } finally { generations.close(); }
}
