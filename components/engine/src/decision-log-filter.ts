import { createHash } from "node:crypto";
import { digest } from "./core.ts";
import type { EvidenceItem, QuestionInstance, QuestionOutcome } from "./decision-schema.ts";
import { interpretNoul } from "./decision-runtime.ts";

const NATIVE_FAILURE = /(?:\b(?:errors?|fail(?:ed|ure)?|fatal|panic|exceptions?|traceback|denied|timeout|timed out|cancell?ed|could not|unable to)\b|\b[A-Za-z_$][\w$]*(?:Error|Exception)\b|\bERR_[A-Z_]+\b)/iu;
const FAILURE = /\b(?:error|errors|fail|failed|failure|fatal|panic|exception|traceback|warning|warn|denied|timeout|timed out|cancell?ed|unowned|leak|cleanup|could not|unable to|remaining|blocked|uncertain|unverified|not run|not tested|incomplete|contradict\w*)\b/iu;
const RESULT = /(?:\b(?:passed|succeeded|success|results?|summary|exit(?:\s+code)?|status|tests?\s*[:=]|suites?\s*[:=])\b|^(?:ok|not ok)\s+\d+|^#\s*(?:tests|pass|fail|cancelled|skipped|todo|duration))/imu;
const CONTINUATION = /^(?:\s+|at\s|File "|Caused by:|\.\.\.\s|\t)/u;
const ROUTINE = /^(?:\[[^\]\n]+\]\s*)?(?:DEBUG\b|TRACE\b|VERBOSE\b|progress\b|download(?:ing)?\s+\d|\d+(?:\.\d+)?\s*%)/iu;
const MAX_GROUPS = 512, MAX_QUESTIONS = 12, MAX_BLOCK_BYTES = 2000;
const literalDigest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export interface LogFilterBlock {
  id: string; firstLine: number; lastLine: number; bytes: number; text: string;
  protected: boolean; protectedReason: string | null; rangeDigest: string; routine: boolean;
}
export interface LongLogPilot { purpose: "long-log-filtering"; arm: "deterministic" | "jev"; minimumBytes?: number }
export interface LongLogPlan {
  eligible: boolean; reason: string; blocks: LogFilterBlock[]; totalLines: number;
  deterministicIds: string[]; optionalIds: string[]; protectedIds: string[];
  sourceDigest: string; limits: string[]; protectedBytes: number;
}

/** Blank lines are separators; protected sections and adjacent stack continuations stay complete. */
export function segmentLogOutput(content: string, options: { failed: boolean; cleanupUnknown: boolean }): { blocks: LogFilterBlock[]; truncated: boolean } {
  const sourceLines = content.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const groups: Array<{ first: number; last: number; lines: string[] }> = [];
  let current: typeof groups[number] | null = null;
  for (const [index, line] of sourceLines.entries()) {
    if (!line.trim()) { if (current) { groups.push(current); current = null; } continue; }
    if (!current) current = { first: index + 1, last: index + 1, lines: [line] };
    else { current.lines.push(line); current.last = index + 1; }
  }
  if (current) groups.push(current);
  if (groups.length > MAX_GROUPS) return { blocks: [], truncated: true };
  const nativeFailures = groups.map(group => NATIVE_FAILURE.test(group.lines.join("")));
  const marked = groups.map((group, index) => nativeFailures[index] || FAILURE.test(group.lines.join("")));
  const blocks = groups.map((group, index): LogFilterBlock => {
    const original = group.lines.join(""), blockText = original.replace(/\n$/u, "");
    const continuation = index > 0 && marked[index - 1] === true && group.lines.every(line => CONTINUATION.test(line));
    if (continuation) marked[index] = true;
    const reason = marked[index] && !continuation ? "failure-or-warning-marker" : continuation ? "stack-continuation"
      : RESULT.test(blockText) ? "result-or-status" : index === 0 || index === groups.length - 1 ? "first-or-final-block"
        : options.cleanupUnknown && /resource|lease|process/iu.test(blockText) ? "cleanup-uncertainty" : null;
    return { id: `block:${index + 1}`, firstLine: group.first, lastLine: group.last, bytes: Buffer.byteLength(blockText), text: blockText,
      protected: reason !== null, protectedReason: reason, rangeDigest: literalDigest(original), routine: group.lines.every(line => ROUTINE.test(line)) };
  });
  // A warning or cleanup caveat does not establish where a native failure occurred.
  if (options.failed && !nativeFailures.some(Boolean)) for (const block of blocks) { block.protected = true; block.protectedReason ??= "unlocated-native-failure"; }
  return { blocks, truncated: false };
}

function structured(content: string): boolean {
  const trimmed = content.trim();
  if (/^(?:<\?xml\b|<testsuites?\b)/u.test(trimmed)) return true;
  try { const value: unknown = JSON.parse(trimmed); if (value !== null && typeof value === "object") return true; } catch { /* Plain output is the pilot's input. */ }
  const nonempty = content.split("\n").filter(line => line.trim());
  return nonempty.length > 1 && nonempty.every(line => { try { const value: unknown = JSON.parse(line); return value !== null && typeof value === "object"; } catch { return false; } });
}

/** Code removes only declared routine chatter and repeated optional blocks; substantive material stays. */
export function packLongLog(content: string, options: { failed: boolean; cleanupUnknown: boolean; pilot?: LongLogPilot; truncated: boolean; limitBytes: number }): LongLogPlan {
  const sourceDigest = literalDigest(content), totalLines = (content.match(/[^\n]*\n|[^\n]+$/gu) ?? []).length;
  const empty = (reason: string): LongLogPlan => ({ eligible: false, reason, blocks: [], totalLines, deterministicIds: [], optionalIds: [], protectedIds: [], sourceDigest, limits: [], protectedBytes: 0 });
  if (!Number.isSafeInteger(options.limitBytes) || options.limitBytes < 1) throw new Error("Invalid log presentation limit");
  if (!options.pilot) return empty("log-pilot-not-requested");
  if (options.pilot.purpose !== "long-log-filtering" || !["deterministic", "jev"].includes(options.pilot.arm)) throw new Error("Invalid long-log pilot purpose or arm");
  const minimum = options.pilot.minimumBytes ?? 4096;
  if (!Number.isSafeInteger(minimum) || minimum < 4096 || minimum > 256 * 1024) throw new Error("Long-log minimum must be 4096 to 262144 bytes");
  if (options.truncated) return empty("incomplete-output");
  if (Buffer.byteLength(content) < minimum) return empty("small-output");
  if (structured(content)) return empty("structured-output");
  const segmented = segmentLogOutput(content, options);
  if (segmented.truncated) return { ...empty("incomplete-block-index"), limits: ["block index exceeds 512 complete blocks; use the original"] };
  const protectedIds = segmented.blocks.filter(block => block.protected).map(block => block.id);
  const seen = new Set<string>(), deterministicIds: string[] = [], optionalIds: string[] = [], limits: string[] = [];
  for (const block of segmented.blocks) {
    const repeated = seen.has(block.text);
    seen.add(block.text);
    if (block.protected || !block.routine && !repeated || block.bytes > MAX_BLOCK_BYTES) {
      deterministicIds.push(block.id);
      if (!block.protected && block.bytes > MAX_BLOCK_BYTES) limits.push(`${block.id}: retained whole because it exceeds optional evidence allowance`);
    } else optionalIds.push(block.id);
  }
  const protectedBytes = Buffer.byteLength(renderLogSelection(content, segmented.blocks, protectedIds));
  if (protectedBytes > options.limitBytes) return { eligible: false, reason: "protected-overflow", blocks: segmented.blocks, totalLines, deterministicIds, optionalIds, protectedIds, sourceDigest, limits, protectedBytes };
  if (Buffer.byteLength(renderLogSelection(content, segmented.blocks, deterministicIds)) > options.limitBytes)
    return { eligible: false, reason: "retained-output-overflow", blocks: segmented.blocks, totalLines, deterministicIds, optionalIds, protectedIds, sourceDigest, limits: [...limits, "complete retained material exceeds presentation limit; use the original"], protectedBytes };
  return { eligible: true, reason: optionalIds.length ? "deterministic-log-filter" : "no-optional-block", blocks: segmented.blocks, totalLines, deterministicIds, optionalIds, protectedIds, sourceDigest, limits, protectedBytes };
}

/** Reconstruct only from exact captured lines. Presentation never edits protected text. */
export function renderLogSelection(content: string, blocks: LogFilterBlock[], selectedIds: string[]): string {
  const selected = new Set(selectedIds), omitted = blocks.filter(block => !selected.has(block.id));
  return (content.match(/[^\n]*\n|[^\n]+$/gu) ?? []).filter((_line, index) => !omitted.some(block => index + 1 >= block.firstLine && index + 1 <= block.lastLine)).join("");
}

/** Prepare the existing DL13 question, with exact ranges and a bounded number of complete blocks. */
export function logFilterQuestions(plan: LongLogPlan, task: string, evidenceBytes: number) {
  const evidence: EvidenceItem[] = [{ id: "task:purpose", text: task, sourceDigest: digest(task), provenance: "supplied", trust: "untrusted" }];
  const questions: QuestionInstance[] = [], questionBlocks = new Map<string, LogFilterBlock>(), limits: string[] = [];
  let remaining = evidenceBytes - Buffer.byteLength(task);
  for (const block of plan.blocks.filter(block => plan.optionalIds.includes(block.id))) {
    if (questions.length === MAX_QUESTIONS || block.bytes > remaining) {
      limits.push(`${block.id}: not assessed within optional question/evidence allowance`); continue;
    }
    remaining -= block.bytes;
    evidence.push({ id: block.id, text: block.text, sourceDigest: plan.sourceDigest, provenance: "captured", trust: "untrusted",
      range: { firstLine: block.firstLine, lastLine: block.lastLine, totalLines: plan.totalLines } });
    const name = `q${questions.length + 1}`;
    questions.push({ name, definitionId: "output.keep-block/1", consumerId: "DL13", evidenceIds: [block.id, "task:purpose"] });
    questionBlocks.set(name, block);
  }
  return { evidence, questions, questionBlocks, limits };
}

/** JEV can add useful optional material; it cannot drop any code-retained block. */
export function applyLogFilterAdvice(plan: LongLogPlan, questionBlocks: Map<string, LogFilterBlock>, answers: Record<string, QuestionOutcome>) {
  const selected = new Set(plan.deterministicIds), judgments: Array<{ blockId: string; value: string; probability: number | null }> = [];
  let uncertain = false;
  for (const [name, block] of questionBlocks) {
    const reading = interpretNoul(answers[name]);
    judgments.push({ blockId: block.id, ...reading });
    if (reading.value === "positive") selected.add(block.id);
    if (["uncertain", "unknown"].includes(reading.value)) uncertain = true;
  }
  return { selectedIds: plan.blocks.filter(block => selected.has(block.id)).map(block => block.id), judgments, uncertain };
}
