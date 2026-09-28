/** Separate local preparation from optional provider latency; neither can renew the overall allowance. */
export const CONTEXT_OPERATION_MS = 30_000;
export const CONTEXT_DELIVERY_RESERVE_MS = 500;
export const CONTEXT_SELECTION_MS = CONTEXT_OPERATION_MS - CONTEXT_DELIVERY_RESERVE_MS;
export const CONTEXT_PASSAGE_RESERVE_MS = 5_000;
export const CONTEXT_HOOK_SECONDS = 40;

export class ContextTiming {
  readonly started: number;
  readonly deadline: number;
  sourceCaptureMs = 0;
  #selectionStart: number | null = null;
  #selectionEnd: number | null = null;
  #limitReason: "operation-deadline" | "selection-deadline" | "provider-deadline" | "caller-cancelled" | null = null;
  readonly now: () => number;
  constructor(started?: number, now: () => number = () => performance.now()) {
    this.now = now;
    this.started = started ?? now();
    this.deadline = this.started + CONTEXT_OPERATION_MS;
  }
  beginSelection() {
    this.#selectionStart ??= this.now();
    return this.deadline - CONTEXT_DELIVERY_RESERVE_MS;
  }
  endSelection(reason?: string, signal?: AbortSignal, invocationDeadlineHit = false) {
    this.#selectionEnd = this.now();
    if (signal?.aborted) this.#limitReason = signal.reason === "context-operation-deadline" ? "operation-deadline" : "caller-cancelled";
    else if (reason === "cancelled" || reason === "deadline" || reason === "admission-deadline") {
      const selectionDeadline = this.deadline - CONTEXT_DELIVERY_RESERVE_MS;
      if (invocationDeadlineHit || this.#selectionEnd >= selectionDeadline)
        this.#limitReason = this.#selectionEnd >= this.deadline ? "operation-deadline" : "selection-deadline";
      else if (reason === "deadline") this.#limitReason = "provider-deadline";
    }
  }
  snapshot(providerCallMs = 0, indexMs = 0) {
    const end = this.now(), selectionStart = this.#selectionStart ?? end, selectionEnd = this.#selectionEnd ?? end;
    return { version: 1, preparationMs: Math.max(0, selectionStart - this.started),
      sourceCaptureMs: this.sourceCaptureMs, indexMs, selectionMs: Math.max(0, selectionEnd - selectionStart), providerCallMs,
      deliveryMs: Math.max(0, end - selectionEnd), totalMs: Math.max(0, end - this.started),
      operationBudgetMs: CONTEXT_OPERATION_MS, selectionBudgetMs: Math.max(0, this.deadline - CONTEXT_DELIVERY_RESERVE_MS - selectionStart),
      deliveryReserveMs: CONTEXT_DELIVERY_RESERVE_MS,
      operationOverrunMs: Math.max(0, end - this.deadline), limitReason: this.#limitReason };
  }
}
