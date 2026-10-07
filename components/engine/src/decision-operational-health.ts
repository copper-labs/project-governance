import { readDecisionOutcome } from "./decision-outcome-reader.ts";
import { recentReceipts } from "./telemetry-receipt-reader.ts";
import { RELEASE_VERSION } from "./release-version.ts";
import { contextStateRoot } from "./context-command.ts";

/** Fixed operator guidance cannot carry a provider's arbitrary response or credentials. */
export function providerFailureAction(reason: string, provider = "jev") {
  if (reason === "billing-unavailable") return `Restore ${provider === "openai" ? "OpenAI" : "TypeSafe"} API credit or correct the funded account, then retry a new governed request. Local fallback remains available.`;
  if (reason === "authentication-rejected") return `Correct the ${provider === "openai" ? "OPENAI_API_KEY" : "JEV_TOKEN"} credential; never put the token in project files or diagnostic output.`;
  if (reason === "request-rejected") return "Inspect the recorded HTTP status and the issued request contract before retrying; do not change budgets to mask a rejected request.";
  if (reason === "provider-overloaded") return "Wait for the recorded provider cooldown; local fallback remains available.";
  return "Inspect the retained decision receipt and telemetry decisions; configuration eligibility does not establish successful inference.";
}

/** Passive health is evidence about one exact configuration, never a credential probe. */
export function observedDecisionHealth(workspace: string, configDigest: string) {
  const receipts = recentReceipts(contextStateRoot(workspace), ["decisions"], { limit: 1,
    predicate: receipt => {
      const outcome = receipt.outcome as Record<string, unknown> | undefined;
      const scope = outcome?.scope as Record<string, unknown> | undefined;
      return [2, 3].includes(Number(receipt.version)) && receipt.runtimeVersion === RELEASE_VERSION && receipt.configDigest === configDigest &&
        scope?.workspace === workspace && outcome?.providerCalled === true && outcome.reason !== "cancelled";
    } });
  const latest = receipts.records[0];
  if (!latest) return { state: "not-observed", configurationBound: true, scanComplete: receipts.scanComplete,
    next: "A configured token is not live proof. Verify a normal governed request returns usable provider answers; missing credentials and provider failures must be labelled fallback." };
  let outcome: ReturnType<typeof readDecisionOutcome>;
  try { outcome = readDecisionOutcome(latest.value); }
  catch {
    return { state: "evidence-invalid", configurationBound: true, scanComplete: receipts.scanComplete,
      receiptId: latest.value.receiptId, reason: "decision-receipt-invalid",
      next: "Inspect the retained decision receipt. Invalid evidence cannot establish provider health or invalidate the project configuration." };
  }
  const transport = outcome.transport as Record<string, unknown> | undefined;
  const status = transport?.httpStatus;
  const reason = typeof outcome.reason === "string" && /^[a-z][a-z-]{0,127}$/u.test(outcome.reason) ? outcome.reason : "unknown";
  const succeeded = outcome.method === "provider" && outcome.delivered === true || outcome.reason === "shadow";
  return { state: succeeded ? "succeeded" : "failed", configurationBound: true,
    scanComplete: receipts.scanComplete, createdAt: latest.value.createdAt, receiptId: latest.value.receiptId,
    httpStatus: Number.isSafeInteger(status) && Number(status) >= 100 && Number(status) <= 599 ? status : null,
    provider: outcome.provider, reason, delivered: outcome.delivered === true,
    next: succeeded ? outcome.reason === "shadow" ? "Observed provider answers stayed in shadow; the normal packet did not use them."
      : "Observed provider success does not establish relevance quality or token savings." : providerFailureAction(reason, outcome.provider.id) };
}
