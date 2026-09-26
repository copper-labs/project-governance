/** Separate local preparation from optional provider latency; neither can renew the overall allowance. */
export const CONTEXT_OPERATION_MS = 10_000;
export const CONTEXT_SELECTION_MS = 3_500;
export const CONTEXT_HOOK_SECONDS = 15;

export class ContextTiming {
  readonly started: number;
  readonly deadline: number;
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
    return Math.min(this.deadline, this.#selectionStart + CONTEXT_SELECTION_MS);
  }
  endSelection(reason?: string, signal?: AbortSignal, invocationDeadlineHit = false) {
    this.#selectionEnd = this.now();
    if (signal?.aborted) this.#limitReason = signal.reason === "context-operation-deadline" ? "operation-deadline" : "caller-cancelled";
    else if (reason === "cancelled" || reason === "deadline") {
      const selectionDeadline = (this.#selectionStart ?? this.started) + CONTEXT_SELECTION_MS;
      if (invocationDeadlineHit || this.#selectionEnd >= Math.min(this.deadline, selectionDeadline))
        this.#limitReason = this.deadline <= selectionDeadline ? "operation-deadline" : "selection-deadline";
      else if (reason === "deadline") this.#limitReason = "provider-deadline";
    }
  }
  snapshot(providerCallMs = 0, indexMs = 0) {
    const end = this.now(), selectionStart = this.#selectionStart ?? end, selectionEnd = this.#selectionEnd ?? end;
    return { version: 1, preparationMs: Math.max(0, selectionStart - this.started),
      indexMs, selectionMs: Math.max(0, selectionEnd - selectionStart), providerCallMs,
      deliveryMs: Math.max(0, end - selectionEnd), totalMs: Math.max(0, end - this.started),
      operationBudgetMs: CONTEXT_OPERATION_MS, selectionBudgetMs: CONTEXT_SELECTION_MS,
      operationOverrunMs: Math.max(0, end - this.deadline), limitReason: this.#limitReason };
  }
}
