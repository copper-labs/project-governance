import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, object, text } from "./core.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import { providerCommand } from "./provider-command.ts";

/** Receipt-bound planning only; continuation still needs fresh job admission and resource claims. */
export function providerFollowUp(parentDirectory: string, parentDigest: string,
  next: { id: string; prompt: string; directory: string }) {
  parentDirectory = resolve(parentDirectory);
  const read = (path: string, maximum: number) => {
    if (statSync(path).size > maximum) throw new Error("Oversized provider continuation evidence");
    return object(JSON.parse(readFileSync(path, "utf8")));
  };
  const prior = read(join(parentDirectory, "request.json"), 2 * 1024 * 1024) as unknown as CommandRequest;
  if (digest(prior) !== parentDigest || prior.version !== 1 || !prior.provider) throw new Error("Provider parent request identity mismatch");
  const observed = observeCommand(parentDirectory, parentDigest);
  const receipt = observed.receipt;
  if (observed.state !== "terminal" || !receipt || receipt.state === "unknown" || receipt.cleanup !== "confirmed" || !receipt.providerResult) {
    throw new Error("Provider continuation requires terminal identity and confirmed cleanup");
  }
  const result = read(receipt.providerResult, 16 * 1024 * 1024);
  if (result.version !== 1 || result.requestDigest !== parentDigest) throw new Error("Provider result request mismatch");
  const identity = object(result.identity, "verified provider identity");
  const permissions = { claude: "bypassPermissions", gemini: "always-proceed", codex: "dangerFullAccess" };
  if (identity.model !== prior.provider.model || identity.requestedEffort !== prior.provider.effort ||
      (identity.reportedEffort !== null && identity.reportedEffort !== prior.provider.effort) ||
      identity.permissions !== permissions[prior.provider.kind] ||
      (prior.provider.conversationId !== undefined && identity.conversationId !== prior.provider.conversationId)) {
    throw new Error("Provider continuation identity drift");
  }
  if (!Array.isArray(prior.provider.additionalRoots)) throw new Error("Provider parent lacks recorded workspace scope");
  if (!prior.coordination || !prior.provider.access) throw new Error("Provider parent lacks workspace coordination");
  if (next.id === prior.id || resolve(next.directory) === parentDirectory) throw new Error("Provider continuation needs a distinct job");
  const command = providerCommand({ id: next.id, prompt: next.prompt, provider: prior.provider.kind,
    workspace: prior.operation.cwd, additionalRoots: prior.provider.additionalRoots, access: prior.provider.access, registry: prior.coordination.registry,
    ...(prior.assignment ? { assignment: { role: prior.assignment.role, constraints: prior.assignment.constraints, context: prior.assignment.context } } : {}),
    executable: text(prior.operation.argv[0], "recorded provider executable"), model: prior.provider.model, effort: prior.provider.effort,
    conversationId: text(identity.conversationId, "verified provider conversation", 256),
    requiredTools: prior.provider.requiredTools, deadlineMs: prior.deadlineMs, outputLimit: prior.outputLimit }, next.directory);
  if (prior.idleTimeoutMs !== undefined) command.idleTimeoutMs = prior.idleTimeoutMs;
  // Credentials and explicit environment remain governed by the original assignment; never rediscover ambient secrets.
  command.operation.env = structuredClone(prior.operation.env);
  if (prior.operation.credentialEnv) command.operation.credentialEnv = [...prior.operation.credentialEnv];
  command.operation.effect = prior.operation.effect;
  return { parent: { directory: parentDirectory, requestDigest: parentDigest, resultDigest: receipt.providerResultDigest! }, command };
}
