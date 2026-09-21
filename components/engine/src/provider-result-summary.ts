import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { object } from "./core.ts";
import type { CommandReceipt } from "./process-owner.ts";

/** Bounded public completion projection; raw provider logs and assignment text stay in private artifacts. */
export function providerResultSummary(receipt: CommandReceipt | null) {
  if (!receipt?.providerResult) return null;
  if (statSync(receipt.providerResult).size > 16 * 1024 * 1024) throw new Error("Provider result exceeds evidence limit");
  const bytes = readFileSync(receipt.providerResult);
  if (bytes.length > 16 * 1024 * 1024 || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== receipt.providerResultDigest) throw new Error("Provider result changed during observation");
  const result = object(JSON.parse(bytes.toString("utf8")));
  if (result.version !== 1 || result.requestDigest !== receipt.requestDigest) throw new Error("Provider result request mismatch");
  let truncated = false;
  const bounded = (value: unknown, limit: number) => {
    if (typeof value !== "string") throw new Error("Invalid public provider completion");
    if (value.length > limit) truncated = true;
    return value.slice(0, limit);
  };
  const list = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error("Invalid public provider completion list");
    if (value.length > 20) truncated = true;
    return value.slice(0, 20).map(item => bounded(item, 2000));
  };
  const record = result.completion === null ? null : object(result.completion);
  let completion = null;
  if (record) {
    if (!Array.isArray(record.checks)) throw new Error("Invalid public provider checks");
    if (record.checks.length > 20) truncated = true;
    completion = { outcome: bounded(record.outcome, 32), answer: bounded(record.answer, 16000), artifacts: list(record.artifacts), sources: list(record.sources), remaining: list(record.remaining),
      checks: record.checks.slice(0, 20).map(value => { const check = object(value); return { description: bounded(check.description, 2000), result: bounded(check.result, 2000), evidence: bounded(check.evidence, 2000) }; }) };
  }
  const rawIdentity = result.identity === null ? null : object(result.identity);
  const identity = rawIdentity ? { conversationId: bounded(rawIdentity.conversationId, 256), model: bounded(rawIdentity.model, 256),
    requestedEffort: bounded(rawIdentity.requestedEffort, 64), reportedEffort: rawIdentity.reportedEffort === null ? null : bounded(rawIdentity.reportedEffort, 64), permissions: bounded(rawIdentity.permissions, 128) } : null;
  return { state: bounded(result.state, 32), identity, completion, truncated,
    evidence: { path: receipt.providerResult, digest: receipt.providerResultDigest } };
}
