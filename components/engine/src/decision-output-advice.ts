import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { digest } from "./core.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretNoul, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";
import type { CommandReceipt } from "./process-owner.ts";

const READ_WINDOW = 256 * 1024, MAX_BLOCKS = 24, MAX_OPTIONAL_BLOCKS = 12, MAX_BLOCK_BYTES = 2000;
const PROTECTED = /\b(?:error|errors|fail|failed|failure|fatal|panic|exception|traceback|warning|warn|denied|timeout|timed out|cancell?ed|unowned|leak|cleanup|could not|unable to|remaining|blocked|uncertain|unverified|not run|not tested|incomplete|contradict\w*)\b/iu;
const CONTINUATION = /^(?:\s+|at\s|File "|Caused by:|\.\.\.\s|\t)/u;

export interface OutputBlock {
  id: string; firstLine: number; lastLine: number; bytes: number; text: string;
  protected: boolean; protectedReason: string | null;
}

/** Code protects native status, failures, required warnings, cleanup uncertainty and continuations. */
export function segmentCommandOutput(content: string, options: { failed: boolean; cleanupUnknown: boolean }): { blocks: OutputBlock[]; truncated: boolean } {
  const lines = content.split("\n");
  const groups: Array<{ first: number; last: number; text: string[] }> = [];
  let current: { first: number; last: number; text: string[] } | null = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) { if (current) { groups.push(current); current = null; } continue; }
    if (!current) current = { first: index + 1, last: index + 1, text: [line] };
    else { current.text.push(line); current.last = index + 1; }
  }
  if (current) groups.push(current);
  const truncated = groups.length > MAX_BLOCKS;
  const selected = truncated ? [...groups.slice(0, MAX_BLOCKS - 1), groups[groups.length - 1]!] : groups;
  const markers = selected.map(group => PROTECTED.test(group.text.join("\n")));
  const blocks: OutputBlock[] = selected.map((group, index) => {
    const text = group.text.join("\n");
    // A split stack or continuation immediately after a marker stays with the evidence it explains.
    const continuation = index > 0 && markers[index - 1] === true && group.text.every(line => CONTINUATION.test(line));
    const edge = index === 0 || index === selected.length - 1;
    const reason = markers[index] ? "failure-or-warning-marker" : continuation ? "stack-continuation"
      : edge ? "first-or-final-block" : options.cleanupUnknown && /cleanup|resource|lease/iu.test(text) ? "cleanup-uncertainty" : null;
    if (continuation) markers[index] = true;
    return { id: `block:${index + 1}`, firstLine: group.first, lastLine: group.last, bytes: Buffer.byteLength(text),
      text, protected: reason !== null, protectedReason: reason };
  });
  // A failure whose evidence cannot be located keeps everything: reduction never hides an unknown cause.
  if (options.failed && !markers.some(Boolean)) for (const block of blocks) if (!block.protected) { block.protected = true; block.protectedReason = "unlocated-native-failure"; }
  return { blocks, truncated };
}

function readTail(path: string): { text: string; digest: string; bytes: number; totalBytes: number; truncated: boolean } | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) return null;
    const start = Math.max(0, stat.size - READ_WINDOW);
    const buffer = Buffer.alloc(Math.min(READ_WINDOW, stat.size));
    let read = 0;
    while (read < buffer.length) { const count = readSync(fd, buffer, read, buffer.length - read, start + read); if (!count) break; read += count; }
    const slice = buffer.subarray(0, read);
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(slice), digest: `sha256:${createHash("sha256").update(slice).digest("hex")}`,
      bytes: read, totalBytes: stat.size, truncated: start > 0 };
  } catch { return null; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* Preserve the diagnostic result. */ } }
}

export interface OutputSelection {
  version: 1; kind: "project-governance-output-selection";
  authority: "advisory only: the native receipt, machine parsing, exit status and the complete original output are unchanged";
  mode: string; effect: string; reason: string; delivered: boolean;
  source: { path: string; digest: string | null; capturedBytes: number | null; totalBytes: number | null; windowTruncated: boolean; blockCount: number; blocksTruncated: boolean };
  selection: { text: string; bytes: number; blockIds: string[] } | null;
  omitted: Array<{ id: string; firstLine: number; lastLine: number; bytes: number; reason: string; probability: number | null; within: "completion.answer" | "log"; coordinateTextDigest: string }>;
  protectedBlocks: string[];
  overflow: { protectedBytes: number; limitBytes: number; note: string } | null;
  retrieval: { path: string; digest: string | null; note: string };
  coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/**
 * Select optional output blocks for the coding model. The complete original stays under its existing
 * retention owner and is always reachable; omissions are listed with exact ranges.
 */
export async function outputSelection(runtime: DecisionRuntime, receipt: CommandReceipt,
  scope: BudgetScope | null, options: { task: string; eventId: string; policyDigest: string; environment: string; revision: string; limitBytes?: number;
    presentation?: { text: string; originalPath: string; originalDigest: string; truncated: boolean } }): Promise<OutputSelection> {
  const eligibility = runtime.eligibility("DL13");
  const limitBytes = options.limitBytes ?? 16_000;
  const limits: string[] = [], unavailable: string[] = [];
  const base: OutputSelection = {
    version: 1, kind: "project-governance-output-selection",
    authority: "advisory only: the native receipt, machine parsing, exit status and the complete original output are unchanged",
    mode: eligibility.mode, effect: eligibility.effect, reason: eligibility.reasons[0] ?? "no-assessable-output", delivered: false,
    source: { path: receipt.log, digest: null, capturedBytes: null, totalBytes: null, windowTruncated: false, blockCount: 0, blocksTruncated: false },
    selection: null, omitted: [], protectedBlocks: [], overflow: null,
    retrieval: { path: receipt.log, digest: null, note: "the complete original output remains available under its existing retention policy; a reference is not a permanent guarantee" },
    coverage: { captured: 0, omitted: [], truncated: false, unavailable, limits }, decision: null,
  };
  const presentation = options.presentation;
  const captured = presentation ? { text: presentation.text, digest: `sha256:${createHash("sha256").update(presentation.text).digest("hex")}`,
    bytes: Buffer.byteLength(presentation.text), totalBytes: Buffer.byteLength(presentation.text), truncated: presentation.truncated } : readTail(receipt.log);
  if (!captured) { unavailable.push("command-log"); limits.push("the archived command output could not be read; unmodified delivery applies"); return { ...base, reason: "archive-unavailable" }; }
  const failed = receipt.state !== "succeeded" || (receipt.exitCode !== null && receipt.exitCode !== 0);
  const { blocks, truncated } = segmentCommandOutput(captured.text, { failed, cleanupUnknown: receipt.cleanup !== "confirmed" });
  base.source = { path: presentation?.originalPath ?? receipt.log, digest: captured.digest, capturedBytes: captured.bytes, totalBytes: captured.totalBytes,
    windowTruncated: captured.truncated, blockCount: blocks.length, blocksTruncated: truncated };
  base.retrieval = { ...base.retrieval, path: presentation?.originalPath ?? receipt.log, digest: presentation?.originalDigest ?? captured.digest };
  if (captured.truncated) limits.push(`the archived output was read from its final ${READ_WINDOW} bytes`);
  if (truncated) limits.push("the block index was bounded; intermediate blocks are retained in the original only");
  if (captured.truncated || truncated) return { ...base, reason: "incomplete-output", coverage: {
    captured: blocks.length, omitted: [], truncated: true, unavailable, limits } };
  const protectedBlocks = blocks.filter(block => block.protected);
  const protectedBytes = protectedBlocks.reduce((sum, block) => sum + block.bytes, 0);
  base.protectedBlocks = protectedBlocks.map(block => block.id);
  if (protectedBytes > limitBytes) {
    // Overflow is reported; protected content is never dropped to make a reduction look successful.
    base.overflow = { protectedBytes, limitBytes, note: "protected content exceeds the caller's limit; retrieve the original output" };
    limits.push("protected content exceeds the delivery limit");
  }
  const optional = blocks.filter(block => !block.protected).slice(0, MAX_OPTIONAL_BLOCKS);
  if (optional.length < blocks.filter(block => !block.protected).length) limits.push("only the first optional blocks were assessed; the rest are retained");
  const keepAll = () => {
    const kept = blocks;
    return { ...base, selection: { text: captured.text, bytes: Buffer.byteLength(captured.text), blockIds: kept.map(block => block.id) },
      coverage: { captured: blocks.length, omitted: [], truncated: truncated || captured.truncated, unavailable, limits } };
  };
  if (eligibility.mode === "off" || !optional.length || base.overflow) return { ...keepAll(), reason: eligibility.mode === "off" ? (eligibility.reasons[0] ?? "consumer-off") : base.overflow ? "protected-overflow" : "no-optional-block" };

  const taskId = "task:purpose";
  const evidence: EvidenceItem[] = [{ id: taskId, text: options.task, sourceDigest: digest(options.task), provenance: "supplied", trust: "untrusted" }];
  const questions: QuestionInstance[] = [];
  const index = new Map<string, OutputBlock>();
  let counter = 0;
  let remainingEvidence = runtime.settings.legacy.evidenceBytes - Buffer.byteLength(options.task);
  for (const block of optional) {
    if (block.bytes > MAX_BLOCK_BYTES || block.bytes > remainingEvidence) {
      limits.push(`${block.id}: retained without assessment because it exceeds the evidence allowance`); continue;
    }
    const text = block.text;
    remainingEvidence -= block.bytes;
    evidence.push({ id: block.id, text, sourceDigest: captured.digest, provenance: "captured", trust: "untrusted",
      range: { firstLine: block.firstLine, lastLine: block.lastLine, totalLines: block.lastLine } });
    const name = `q${++counter}`;
    questions.push({ name, definitionId: "output.keep-block/1", consumerId: "DL13", evidenceIds: [block.id, taskId] });
    index.set(name, block);
  }
  const coverage: DecisionCoverage = { captured: blocks.length, omitted: [], truncated: truncated || captured.truncated, unavailable, limits };
  if (!questions.length) return { ...keepAll(), reason: "no-assessable-output" };
  const outcome = await runtime.ask({ consumerId: "DL13", eventId: `${options.eventId}:DL13:${captured.digest}`, scope,
    subject: { digest: captured.digest, revision: options.revision, environment: options.environment },
    evidence, coverage, questions, eligibilityDigest: null, policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  if (!outcome.delivered) return { ...keepAll(), mode: outcome.mode, reason: outcome.reason, coverage, decision };
  const dropped = new Map<string, { reason: string; probability: number | null }>();
  for (const [name, block] of index) {
    const reading = interpretNoul(outcome.answers[name]);
    // Unscored, ambiguous, suspicious or incomplete blocks are kept.
    if (reading.value === "negative") dropped.set(block.id, { reason: "assessed-not-needed", probability: reading.probability });
  }
  const kept = blocks.filter(block => !dropped.has(block.id));
  const omitted = blocks.filter(block => dropped.has(block.id)).map(block => ({ id: block.id, firstLine: block.firstLine,
    lastLine: block.lastLine, bytes: block.bytes, within: options.presentation ? "completion.answer" as const : "log" as const, coordinateTextDigest: captured.digest, reason: dropped.get(block.id)!.reason, probability: dropped.get(block.id)!.probability }));
  const selectedText = captured.text.split("\n").filter((_line, index) => !omitted.some(block => index + 1 >= block.firstLine && index + 1 <= block.lastLine)).join("\n");
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true, coverage, decision, omitted,
    selection: { text: selectedText, bytes: Buffer.byteLength(selectedText), blockIds: kept.map(block => block.id) } };
}
