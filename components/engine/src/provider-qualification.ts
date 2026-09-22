import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { digest, fileDigest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import type { ProviderGuard } from "./provider-guard.ts";

export const QUALIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function verifiedPolicyRefusal(directory: string, request: CommandRequest, receipt: NonNullable<ReturnType<typeof observeCommand>["receipt"]>) {
  if (receipt.state !== "failed" || receipt.reason !== "provider-blocked" || receipt.cleanup !== "confirmed" ||
      !receipt.providerResult || !receipt.providerResultDigest || fileDigest(receipt.providerResult) !== receipt.providerResultDigest) return false;
  const result = object(JSON.parse(narrativeFile(directory, receipt.providerResult))), identity = object(result.identity);
  return result.version === 1 && result.requestDigest === digest(request) && result.state === "blocked" &&
    result.policyRefusal === "permission-denied" && identity.model === request.provider!.model &&
    identity.requestedEffort === request.provider!.effort && (identity.reportedEffort === null || identity.reportedEffort === request.provider!.effort) && identity.permissions === "dontAsk";
}

/** Existing native jobs own capability evidence and later failures; there is no second eligibility ledger. */
export function qualifiedProviderPair(directory: string, requestDigest: string, guard: ProviderGuard, roots: string[], requiredTools: string[] = [], jobRoot = dirname(directory), now = Date.now()) {
  if (realpathSync(directory) !== directory || dirname(directory) !== jobRoot) throw new Error("qualification-directory-mismatch");
  const request = JSON.parse(narrativeFile(directory, "request.json")) as CommandRequest;
  const observation = observeCommand(directory, requestDigest), receipt = observation.receipt;
  if (digest(request) !== requestDigest || !request.provider || digest(request.provider.guard) !== digest(guard) ||
      digest([request.operation.cwd, ...(request.provider.additionalRoots ?? [])]) !== digest(roots) ||
      !requiredTools.every(tool => request.provider!.requiredTools.includes(tool)) ||
      observation.state !== "terminal" || receipt?.state !== "succeeded" || receipt.cleanup !== "confirmed" ||
      !receipt.providerResult || !receipt.providerResultDigest || fileDigest(receipt.providerResult) !== receipt.providerResultDigest)
    throw new Error("qualification-native-evidence-mismatch");
  const ended = Date.parse(receipt.endedAt);
  if (!Number.isFinite(ended) || ended > now || now - ended > QUALIFICATION_MAX_AGE_MS) throw new Error("qualification-expired");
  const result = object(JSON.parse(narrativeFile(directory, receipt.providerResult))), identity = object(result.identity);
  if (result.requestDigest !== requestDigest || result.state !== "succeeded" || identity.model !== request.provider.model || identity.requestedEffort !== request.provider.effort ||
      (identity.reportedEffort !== null && identity.reportedEffort !== request.provider.effort) || identity.permissions !== "dontAsk") throw new Error("qualification-identity-mismatch");
  // Scan only the protected family of this admission, with explicit unknown when bounded history is incomplete.
  const entries = readdirSync(jobRoot, { withFileTypes: true });
  if (entries.length > 1000) throw new Error("qualification-history-incomplete");
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = join(jobRoot, entry.name);
    if (!existsSync(join(candidate, "request.json"))) continue;
    const content = narrativeFile(candidate, "request.json"); bytes += Buffer.byteLength(content);
    if (bytes > 16 * 1024 * 1024) throw new Error("qualification-history-incomplete");
    const later = JSON.parse(content) as CommandRequest;
    if (later.provider?.kind !== "claude" || later.provider.model !== request.provider.model || later.provider.effort !== request.provider.effort ||
        later.operation.cwd !== roots[0] || digest(later.provider.guard) !== digest(guard)) continue;
    const next = observeCommand(candidate, digest(later)).receipt;
    if (!next || Date.parse(next.endedAt) <= ended || next.state === "succeeded" || next.state === "cancelled") continue;
    // Only bound native policy refusals are exempt; an arbitrary blocked answer cannot qualify itself.
    if (["guarded-admission-changed", "resource-admission-failed"].includes(next.reason)) continue;
    if (verifiedPolicyRefusal(candidate, later, next)) continue;
    throw new Error("qualification-invalidated-by-later-failure");
  }
  return { model: request.provider.model, effort: request.provider.effort, resultDigest: receipt.providerResultDigest, endedAt: receipt.endedAt };
}
