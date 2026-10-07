import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import type { BudgetScope } from "./decision-budget.ts";
import type { DecisionOutcome, DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage } from "./decision-schema.ts";
import type { CommandReceipt } from "./process-owner.ts";
import { applyLogFilterAdvice, logFilterQuestions, packLongLog, renderLogSelection, segmentLogOutput, type LongLogPilot } from "./decision-log-filter.ts";

const READ_WINDOW = 256 * 1024;

export interface OutputBlock {
  id: string; firstLine: number; lastLine: number; bytes: number; text: string;
  protected: boolean; protectedReason: string | null;
}

/** Code protects native status, failures, required warnings, cleanup uncertainty and continuations. */
export function segmentCommandOutput(content: string, options: { failed: boolean; cleanupUnknown: boolean }): { blocks: OutputBlock[]; truncated: boolean } {
  return segmentLogOutput(content, options);
}

export function captureOutput(path: string): { text: string; digest: string; bytes: number; totalBytes: number; truncated: boolean } | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) return null;
    const start = Math.max(0, stat.size - READ_WINDOW);
    const buffer = Buffer.alloc(Math.min(READ_WINDOW, stat.size));
    let read = 0;
    while (read < buffer.length) { const count = readSync(fd, buffer, read, buffer.length - read, start + read); if (!count) break; read += count; }
    const after = fstatSync(fd);
    if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs || read !== buffer.length) return null;
    const slice = buffer.subarray(0, read);
    // Replacement characters would make line/range identities differ from retained bytes.
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(slice), digest: `sha256:${createHash("sha256").update(slice).digest("hex")}`,
      bytes: read, totalBytes: stat.size, truncated: start > 0 };
  } catch { return null; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* Preserve the diagnostic result. */ } }
}

export interface OutputSelection {
  version: 3; kind: "project-governance-output-selection";
  authority: "advisory only: the native receipt, machine parsing, exit status and the complete original output are unchanged";
  mode: string; effect: string; reason: string; delivered: boolean;
  source: { path: string; digest: string | null; capturedBytes: number | null; totalBytes: number | null; windowTruncated: boolean; blockCount: number; blocksTruncated: boolean;
    ranges: Array<{ id: string; firstLine: number; lastLine: number; rangeDigest: string; protected: boolean }> };
  selection: { text: string; bytes: number; blockIds: string[] } | null;
  omitted: Array<{ id: string; firstLine: number; lastLine: number; bytes: number; rangeDigest: string; reason: string; probability: number | null; within: "completion.answer" | "log"; coordinateTextDigest: string }>;
  protectedBlocks: string[];
  pilot: { purpose: "long-log-filtering"; arm: "deterministic" | "jev"; judgments: Array<{ blockId: string; value: string; probability: number | null }> } | null;
  native: Pick<CommandReceipt, "state" | "exitCode" | "signal" | "cleanup" | "reason">;
  overflow: { protectedBytes: number; limitBytes: number; note: string } | null;
  retrieval: { path: string; digest: string | null; note: string };
  coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "provider" | "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "providerCalled" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/** One presentation owner: native proof and retained originals are never replaced by advice. */
export async function outputSelection(runtime: DecisionRuntime, receipt: CommandReceipt,
  scope: BudgetScope | null, options: { task: string; eventId: string; policyDigest: string; environment: string; revision: string; limitBytes?: number;
    pilot?: LongLogPilot; presentation?: { text: string; originalPath: string; originalDigest: string; truncated: boolean } }): Promise<OutputSelection> {
  const eligibility = runtime.eligibility("DL13"), limitBytes = options.limitBytes ?? 16_000;
  const limits: string[] = [], unavailable: string[] = [];
  const base: OutputSelection = {
    version: 3, kind: "project-governance-output-selection",
    authority: "advisory only: the native receipt, machine parsing, exit status and the complete original output are unchanged",
    mode: eligibility.mode, effect: eligibility.effect, reason: "no-assessable-output", delivered: false,
    source: { path: receipt.log, digest: null, capturedBytes: null, totalBytes: null, windowTruncated: false, blockCount: 0, blocksTruncated: false, ranges: [] },
    selection: null, omitted: [], protectedBlocks: [], overflow: null,
    pilot: options.pilot ? { purpose: options.pilot.purpose, arm: options.pilot.arm, judgments: [] } : null,
    native: { state: receipt.state, exitCode: receipt.exitCode, signal: receipt.signal, cleanup: receipt.cleanup, reason: receipt.reason },
    retrieval: { path: receipt.log, digest: null, note: "the complete original output remains available under its existing retention policy; a reference is not a permanent guarantee" },
    coverage: { captured: 0, omitted: [], truncated: false, unavailable, limits }, decision: null,
  };
  const presentation = options.presentation;
  const captured = presentation ? { text: presentation.text, digest: `sha256:${createHash("sha256").update(presentation.text).digest("hex")}`,
    bytes: Buffer.byteLength(presentation.text), totalBytes: Buffer.byteLength(presentation.text), truncated: presentation.truncated } : captureOutput(receipt.log);
  if (!captured) { unavailable.push("command-log"); limits.push("the archived command output could not be read; unmodified delivery applies"); return { ...base, reason: "archive-unavailable" }; }
  base.source = { ...base.source, path: presentation?.originalPath ?? receipt.log, digest: captured.digest, capturedBytes: captured.bytes,
    totalBytes: captured.totalBytes, windowTruncated: captured.truncated };
  base.retrieval = { ...base.retrieval, path: presentation?.originalPath ?? receipt.log, digest: presentation?.originalDigest ?? (captured.truncated ? null : captured.digest) };
  if (captured.truncated) {
    limits.push("only a bounded output window was captured; retrieve the complete original; its digest is unknown");
    return { ...base, reason: "incomplete-output", coverage: { ...base.coverage, truncated: true } };
  }
  const keepOriginal = (reason: string): OutputSelection => ({ ...base, reason,
    selection: { text: captured.text, bytes: captured.bytes, blockIds: [] } });
  // Completion prose is not the narrow long-command-log pilot, even when DL13 is enabled.
  if (presentation) return keepOriginal("completion-presentation-excluded");
  const plan = packLongLog(captured.text, { failed: receipt.state !== "succeeded" || receipt.exitCode !== null && receipt.exitCode !== 0,
    cleanupUnknown: receipt.cleanup !== "confirmed", truncated: captured.truncated, limitBytes, ...(options.pilot ? { pilot: options.pilot } : {}) });
  limits.push(...plan.limits);
  base.source.blockCount = plan.blocks.length;
  base.source.ranges = plan.blocks.map(block => ({ id: block.id, firstLine: block.firstLine, lastLine: block.lastLine, rangeDigest: block.rangeDigest, protected: block.protected }));
  base.source.blocksTruncated = plan.reason === "incomplete-block-index";
  base.protectedBlocks = plan.protectedIds;
  base.coverage.captured = plan.blocks.length;
  if (plan.reason === "protected-overflow" || plan.reason === "retained-output-overflow") {
    base.overflow = { protectedBytes: plan.protectedBytes, limitBytes, note: "complete required or retained material exceeds the limit; retrieve the original output" };
    limits.push(plan.reason);
  }
  if (!plan.eligible) return keepOriginal(plan.reason);
  const selection = (ids: string[], reason: string, delivered: boolean): OutputSelection => {
    const text = renderLogSelection(captured.text, plan.blocks, ids), kept = new Set(ids);
    if (Buffer.byteLength(text) > limitBytes) {
      base.overflow = { protectedBytes: plan.protectedBytes, limitBytes, note: "complete additional material exceeds the limit; retrieve the original output" };
      return keepOriginal("selected-output-overflow");
    }
    return { ...base, reason, delivered, selection: { text, bytes: Buffer.byteLength(text), blockIds: ids },
      omitted: plan.blocks.filter(block => !kept.has(block.id)).map(block => ({ id: block.id, firstLine: block.firstLine, lastLine: block.lastLine,
        bytes: block.bytes, rangeDigest: block.rangeDigest, reason: "deterministic-routine-or-repeated-block", probability: null, within: "log" as const, coordinateTextDigest: captured.digest })),
      coverage: { ...base.coverage, omitted: plan.blocks.filter(block => !kept.has(block.id)).map(block => block.id) } };
  };
  if (options.pilot?.arm !== "jev" || eligibility.mode === "off" || !plan.optionalIds.length)
    return selection(plan.deterministicIds, eligibility.mode === "off" && options.pilot?.arm === "jev" ? "consumer-off-deterministic-log-filter" : plan.reason, true);
  const prepared = logFilterQuestions(plan, options.task, runtime.settings.legacy.evidenceBytes);
  limits.push(...prepared.limits);
  if (!prepared.questions.length) return selection(plan.deterministicIds, "no-assessable-output", true);
  const outcome = await runtime.ask({ consumerId: "DL13", eventId: `${options.eventId}:DL13:${captured.digest}`, scope,
    subject: { digest: captured.digest, revision: options.revision, environment: options.environment }, evidence: prepared.evidence,
    coverage: { captured: plan.blocks.length, omitted: plan.optionalIds.filter(id => ![...prepared.questionBlocks.values()].some(block => block.id === id)),
      truncated: false, unavailable, limits }, questions: prepared.questions, eligibilityDigest: null, policyDigest: options.policyDigest });
  base.decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    provider: outcome.provider, method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, providerCalled: outcome.providerCalled, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  base.mode = outcome.mode;
  if (!outcome.delivered) return selection(plan.deterministicIds, outcome.reason, true);
  const advice = applyLogFilterAdvice(plan, prepared.questionBlocks, outcome.answers);
  if (base.pilot) base.pilot.judgments = advice.judgments;
  if (advice.uncertain) {
    limits.push("uncertain optional judgments retain the original; no outcome claim follows from provider answers");
    return keepOriginal("uncertain-output-advice");
  }
  return selection(advice.selectedIds, "deterministic-plus-jev-log-filter", true);
}
