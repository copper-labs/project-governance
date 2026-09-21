import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { statSync } from "node:fs";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";

/** Explicit receipt selection, no raw-log scan and no interpretation of cumulative provider usage as per-job cost. */
export function providerTelemetry(jobs: Array<{ directory: string; requestDigest: string }>) {
  if (!Array.isArray(jobs) || jobs.length > 1000) throw new Error("Provider telemetry accepts at most 1000 job handles");
  const counts = { selected: jobs.length, matched: 0, invalid: 0, duplicates: 0, succeeded: 0, failed: 0, cancelled: 0, unknown: 0 };
  const samples: Array<{ provider: string; state: string; cleanup: string; durationMs: number; reportedUsage: Record<string, number>; usagePresent: boolean }> = [];
  let readBytes = 0, truncated = false;
  const seen = new Set<string>();
  const read = (directory: string, name: string) => {
    const size = statSync(join(directory, name)).size;
    if (readBytes + size > 16 * 1024 * 1024) { truncated = true; throw new Error("Telemetry read budget exceeded"); }
    readBytes += size;
    const raw = narrativeFile(directory, name);
    return { raw, value: object(JSON.parse(raw)) };
  };
  for (const job of jobs) {
    if (truncated) break;
    try {
      const directory = resolve(job.directory), request = read(directory, "request.json").value;
      if (request.version !== 1 || digest(request) !== job.requestDigest) throw new Error("Request mismatch");
      if (seen.has(job.requestDigest)) { counts.duplicates++; continue; }
      const provider = object(request.provider).kind;
      if (typeof provider !== "string" || !["claude", "codex", "gemini"].includes(provider)) throw new Error("Invalid provider");
      const receipt = read(directory, "result.json").value;
      if (receipt.version !== 1 || receipt.requestDigest !== job.requestDigest || !["succeeded", "failed", "cancelled", "unknown"].includes(String(receipt.state)) ||
          !["confirmed", "unknown"].includes(String(receipt.cleanup)) || typeof receipt.durationMs !== "number" || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) throw new Error("Invalid command metrics");
      const reportedUsage: Record<string, number> = {};
      let usagePresent = false;
      if (receipt.providerResult !== undefined) {
        if (receipt.providerResult !== join(directory, "provider-result.json")) throw new Error("Result path mismatch");
        const result = read(directory, "provider-result.json");
        if (`sha256:${createHash("sha256").update(result.raw).digest("hex")}` !== receipt.providerResultDigest || result.value.version !== 1 || result.value.requestDigest !== job.requestDigest) throw new Error("Result mismatch");
        usagePresent = result.value.usage !== null && result.value.usage !== undefined;
        const usage = usagePresent ? object(result.value.usage) : {};
        const fields = provider === "claude" ? ["usage.input_tokens", "usage.output_tokens", "usage.cache_read_input_tokens", "usage.cache_creation_input_tokens", "estimated_cost_usd"]
          : provider === "codex" ? ["last.inputTokens", "last.outputTokens", "last.cachedInputTokens", "total.inputTokens", "total.outputTokens", "total.cachedInputTokens"] : [];
        for (const field of fields) {
          let value: unknown = usage;
          for (const segment of field.split(".")) value = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[segment] : undefined;
          if (value === undefined || value === null) continue;
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (!field.endsWith("usd") && !Number.isSafeInteger(value))) throw new Error("Invalid native usage");
          reportedUsage[field] = value;
        }
      }
      seen.add(job.requestDigest); counts.matched++; counts[receipt.state as "succeeded" | "failed" | "cancelled" | "unknown"]++;
      samples.push({ provider, state: String(receipt.state), cleanup: String(receipt.cleanup), durationMs: receipt.durationMs, reportedUsage, usagePresent });
    } catch { if (!truncated) counts.invalid++; }
  }
  return { version: 1, counts, samples, truncated, readBytes, selection: "caller-selected receipts; not a representative sample",
    accounting: "native field observations; cumulative and per-turn values are not summed; absent fields are unknown",
    unsupportedUsageMapping: ["gemini"], acceptedWorkBenefit: "not-evaluated", avoidedTokens: null };
}
