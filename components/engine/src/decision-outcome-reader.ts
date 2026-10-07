import { object } from "./core.ts";
import type { DecisionProviderIdentity, DecisionUsage } from "./decision-providers.ts";

/** Read current outcomes or project retained JEV receipts. Never rewrite or qualify missing history. */
export function readDecisionOutcome(raw: unknown): Record<string, unknown> & {
  version: 3; method: "baseline" | "provider"; provider: DecisionProviderIdentity; usage: DecisionUsage;
} {
  const receipt = object(raw), outcome = object(receipt.outcome);
  if (receipt.version !== outcome.version || (receipt.version !== 2 && receipt.version !== 3)) throw new Error("decision-outcome-version-invalid");
  if (receipt.version === 2) {
    if (outcome.method !== "baseline" && outcome.method !== "jev") throw new Error("historical-decision-method-invalid");
    const usage = object(outcome.usage ?? {}), count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
    return { ...outcome, version: 3, sourceVersion: 2, historicalMethod: outcome.method ?? null,
      method: outcome.method === "jev" ? "provider" : "baseline",
      provider: { id: "jev", adapterVersion: null, requestedModel: null, returnedModel: typeof outcome.model === "string" ? outcome.model : null,
        modelIdentity: "historical-unknown", configurationDigest: typeof receipt.configDigest === "string" ? receipt.configDigest : null },
      usage: { inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens) } };
  }
  if (!["baseline", "provider"].includes(String(outcome.method))) throw new Error("decision-method-invalid");
  const { identity, usage } = readDecisionProviderObservation(outcome);
  return { ...outcome, version: 3, method: outcome.method as "baseline" | "provider", provider: identity as unknown as DecisionProviderIdentity,
    usage: usage as unknown as DecisionUsage };
}

/** Shared conservative native identity/usage validation for registered and supplied receipts. */
export function readDecisionProviderObservation(outcome: Record<string, unknown>) {
  const identity = object(outcome.provider);
  if (!["jev", "openai"].includes(String(identity.id)) ||
      typeof identity.adapterVersion !== "string" || !identity.adapterVersion || typeof identity.requestedModel !== "string" || !identity.requestedModel ||
      identity.returnedModel !== null && typeof identity.returnedModel !== "string" ||
      !["exact-version", "mutable-alias"].includes(String(identity.modelIdentity)) || typeof identity.configurationDigest !== "string") throw new Error("decision-provider-identity-invalid");
  const usage = object(outcome.usage);
  for (const value of Object.values(usage)) if (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("decision-native-usage-invalid");
  for (const key of ["cachedInputTokens", "cacheWriteInputTokens"]) if (typeof usage[key] === "number" && typeof usage.inputTokens === "number" && Number(usage[key]) > Number(usage.inputTokens)) throw new Error("decision-usage-subset-invalid");
  if (typeof usage.reasoningTokens === "number" && typeof usage.outputTokens === "number" && usage.reasoningTokens > usage.outputTokens) throw new Error("decision-usage-subset-invalid");
  if (usage.inputTokens === undefined || usage.outputTokens === undefined) throw new Error("decision-native-usage-missing");
  return { identity: identity as unknown as DecisionProviderIdentity, usage: usage as unknown as DecisionUsage };
}
