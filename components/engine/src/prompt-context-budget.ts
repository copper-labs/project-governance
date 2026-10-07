/** Native delivery uses the reviewed route envelope, including framing and required skills. */
import { contextBudget } from "./checkers/context-router.ts";
import { digest } from "./core.ts";

export const LEGACY_PROMPT_BYTES = 24_000;
export const PROMPT_FRAMING_RESERVE = 2300;

/** Hash the final rendered bytes once, after every delivery path has settled. */
export function promptPacketIdentity(output: string, packetLimitBytes: number) {
  return { packetDigest: digest(output), packetBytes: Buffer.byteLength(output), packetLimitBytes };
}

export function promptPacketLimit(budget: unknown, declaredBytes?: unknown): number {
  const total = contextBudget(budget).total_context_tokens * 4;
  if (declaredBytes === undefined) return Math.min(total, LEGACY_PROMPT_BYTES);
  if (typeof declaredBytes !== "number" || !Number.isSafeInteger(declaredBytes) || declaredBytes <= 0 || declaredBytes > total)
    throw new Error("Invalid native context envelope");
  return declaredBytes;
}

export function requiredPromptText(entries: Array<{ path: string; sourceDigest: string; content: string }>,
  skills: Array<{ path: string; sourceDigest: string; content: string }>, entryId: string, receiptId: string) {
  const header = `Governance prompt context.\nNative entry reference (for --entry): ${entryId}.\nRoute receipt (evidence only): ${receiptId}.\n`;
  const body = [...entries, ...skills].map(item => `${JSON.stringify({ path: item.path, digest: item.sourceDigest })}\n${item.content}`).join("\n\n");
  return { header, text: `${header}Required current guidance:\n${body}\n` };
}
