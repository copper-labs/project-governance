import { RuntimeGenerations } from "./runtime-generations.ts";
import { startupHookAdmission } from "./startup-hook-admission.ts";

export interface RuntimeReader {
  registry: string; token: string; owner: string; revision: number; directory: string;
}
/** Reserve before detached dispatch; a missing worker acknowledgment never frees its generation. */
export function retainRuntimeReader(owner: string, hook?: { workspace: string; stage: string }): RuntimeReader | null {
  const registry = process.env.GOVERNANCE_GENERATION_REGISTRY;
  const token = process.env.GOVERNANCE_GENERATION_TOKEN;
  const parent = process.env.GOVERNANCE_GENERATION_OWNER;
  if (!registry && !token && !parent) return null;
  if (!registry || !token || !parent) throw new Error("Incomplete runtime generation binding");
  const generations = new RuntimeGenerations(registry);
  try {
    // Only native commit checks inherit startup maintenance, never arbitrary detached work.
    const maintenanceToken = hook ? startupHookAdmission(
      ["hook", hook.stage, ...(hook.stage === "commit-msg" ? ["captured-commit-message"] : [])],
      hook.workspace, registry, generations.state().maintenance) : undefined;
    return { registry, ...generations.retain(token, parent, owner, maintenanceToken) };
  }
  finally { generations.close(); }
}
export function releaseRuntimeReader(reader: RuntimeReader | null, confirmedReplay = false): void {
  if (!reader) return;
  const generations = new RuntimeGenerations(reader.registry);
  try { if (confirmedReplay) generations.releaseConfirmed(reader.token, reader.owner, reader.revision); else generations.release(reader.token, reader.owner); }
  finally { generations.close(); }
}
