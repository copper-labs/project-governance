import { join } from "node:path";
import { hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { digest, fileDigest } from "./core.ts";
import type { CommandReceipt } from "./process-owner.ts";

/** Wait briefly for the guardian's independent cleanup proof; never replay or rewrite execution. */
export async function settleWorkflowCommandCleanup(directory: string, receipt: CommandReceipt,
  expectedExitCodes: readonly number[], waitMs = 5000) {
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 5000) throw new Error("Invalid cleanup observation budget");
  if (receipt.cleanup === "confirmed" && receipt.state !== "unknown") return { receipt, recovery: undefined };
  const deadline = performance.now() + waitMs;
  while (!hasConfirmedCommandCleanup(directory,receipt)) {
    const remaining = deadline-performance.now();
    if (remaining <= 0) return { receipt, recovery: undefined };
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,remaining)));
  }
  reconcileCommand(directory,receipt.requestDigest);
  // A known native exit plus cleanup proof is sufficient; lost execution remains unknown.
  let state = receipt.state;
  if (state === "unknown" && receipt.reason === "exit" && receipt.exitCode !== null)
    state = expectedExitCodes.includes(receipt.exitCode) ? "succeeded" : "failed";
  if (state === "unknown" && receipt.reason === "cancelled" && (receipt.exitCode !== null || receipt.signal !== null))
    state = "cancelled";
  const recovery = { receiptDigest: digest(receipt), recoveryDigest: fileDigest(join(directory,"owner-recovery.json")) };
  return { receipt: { ...receipt, state, cleanup: "confirmed" as const }, recovery,
    verificationFailed: state === "unknown" && receipt.reason === "owner-lost" };
}
