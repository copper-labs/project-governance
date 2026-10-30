import { join } from "node:path";
import { hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { digest, fileDigest } from "./core.ts";
import type { CommandReceipt } from "./process-owner.ts";

/** Read the already-qualified view without reconciling, rewriting or inferring lost execution. */
export function qualifiedWorkflowCommandCleanup(directory:string,receipt:CommandReceipt,expectedExitCodes:readonly number[]) {
  if(receipt.cleanup==="confirmed"&&receipt.state!=="unknown")return{receipt,recovery:undefined};
  if(!hasConfirmedCommandCleanup(directory,receipt))return null;
  let state=receipt.state;
  const exitCode=receipt.exitCode,knownExit=typeof exitCode==="number"&&Number.isSafeInteger(exitCode);
  const knownSignal=typeof receipt.signal==="string"&&/^SIG[A-Z0-9]+$/u.test(receipt.signal);
  if(state==="unknown"&&receipt.reason==="exit"&&knownExit)state=expectedExitCodes.includes(exitCode)?"succeeded":"failed";
  if(state==="unknown"&&receipt.reason==="cancelled"&&(knownExit||knownSignal))state="cancelled";
  const recovery={receiptDigest:digest(receipt),recoveryDigest:fileDigest(join(directory,"owner-recovery.json"))};
  return{receipt:{...receipt,state,cleanup:"confirmed" as const},recovery,verificationFailed:state==="unknown"&&receipt.reason==="owner-lost"};
}

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
  return qualifiedWorkflowCommandCleanup(directory,receipt,expectedExitCodes)??{receipt,recovery:undefined};
}
