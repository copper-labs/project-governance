import { performance } from "node:perf_hooks";
import { digest } from "./core.ts";
import { decisionNativeUsage, type DecisionFailureStage } from "./decision-schema.ts";
import { ProviderPool, PROVIDER_LEASE_CLEANUP_MS, PROVIDER_CONCURRENCY, PROVIDER_TOKENS_PER_SECOND, PROVIDER_REQUESTS_PER_MINUTE } from "./decision-admission.ts";

export const DECISION_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const RESPONSE_LIMIT = 262_144;
export interface TransportOptions {
  token?: string | undefined; fetch?: typeof fetch; now?: () => number;
  /** Isolated test state; production uses the one user-local endpoint pool. */
  coordinationRoot?: string;
  /** Opaque workspace/config identity for failures that are not account-wide overload. */
  healthScope?: string;
}
export interface TransportTiming {
  /** HTTP status only; response bodies and arbitrary provider messages are never retained. */
  httpStatus?: number | null;
  admissionMs: number; httpMs: number; totalMs: number; rateWaitMs: number; slotWaitMs: number; coordinationWaitMs: number;
  activeConcurrency: number; dispatched: boolean; attemptId: string | null;
  requestBytes: number;
  coordinationIssues: string[];
  poolLimits: { concurrency: number; estimatedInputTokensPerSecond: number; requestsPerMinute: number };
}
export type TransportOutcome = ({ ok: true; raw: unknown } |
  { ok: false; reason: string; failureStage: DecisionFailureStage }) & { timing: TransportTiming };

/** Bound injected transports and stalled response streams that ignore abort themselves. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Decision transport aborted"));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    if (signal?.aborted) done(); else signal?.addEventListener("abort", done, { once: true });
  });
}
function retryDelay(header: string | null, now: number): number {
  const seconds = header?.trim() ? Number(header) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - now : NaN;
  return Number.isFinite(requested) && requested > 0 ? Math.min(requested, 300000) : 60000;
}
const contention = (error: unknown) => !!error && typeof error === "object" &&
  "errcode" in error && [5, 6].includes(Number(error.errcode));
export const decisionCancellationReason = (signal?: AbortSignal) =>
  ["context-selection-deadline", "context-operation-deadline"].includes(signal?.reason) ? "operation-deadline" : "cancelled";

/** Admission precedes paid reservation; only dispatch starts the individual HTTP clock. */
export class JevDecisionClient {
  readonly #token: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #root: string | undefined;
  readonly #healthScope: string;
  constructor(options: TransportOptions = {}) {
    this.#token = options.token ?? process.env.JEV_TOKEN;
    this.#fetch = options.fetch ?? fetch; this.#now = options.now ?? Date.now;
    this.#root = options.coordinationRoot;
    this.#healthScope = options.healthScope ?? digest({ workspace: process.cwd() });
  }
  get tokenPresent(): boolean { return Boolean(this.#token); }

  async ask(body: string, deadlineMs: number, signal?: AbortSignal, beforeDispatch?: () => boolean, onDispatch?: () => void,
    deadlineOwner: "provider" | "caller" = "provider", deadlineAt?: number): Promise<TransportOutcome> {
    const started = performance.now(), operationDeadline = deadlineAt ?? started + deadlineMs;
    const timing: TransportTiming = { admissionMs: 0, httpMs: 0, totalMs: 0, rateWaitMs: 0, slotWaitMs: 0, coordinationWaitMs: 0,
      activeConcurrency: 0, dispatched: false, attemptId: null, httpStatus: null, requestBytes: Buffer.byteLength(body), coordinationIssues: [],
      poolLimits: { concurrency: PROVIDER_CONCURRENCY, estimatedInputTokensPerSecond: PROVIDER_TOKENS_PER_SECOND, requestsPerMinute: PROVIDER_REQUESTS_PER_MINUTE } };
    let httpStart: number | null = null, httpEnd: number | null = null;
    const done = (outcome: { ok: true; raw: unknown } | { ok: false; reason: string; failureStage: DecisionFailureStage }): TransportOutcome => {
      timing.totalMs = performance.now() - started;
      timing.httpMs = httpStart === null ? 0 : (httpEnd ?? performance.now()) - httpStart;
      timing.admissionMs = (httpStart ?? performance.now()) - started;
      // A pending return becomes visible only after finally finishes the timing record.
      return { ...outcome, timing };
    };
    if (signal?.aborted) return done({ ok: false, reason: decisionCancellationReason(signal), failureStage: "transport" });
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000 || !Number.isFinite(operationDeadline))
      return done({ ok: false, reason: "invalid-deadline", failureStage: "transport" });
    if (!this.#token) return done({ ok: false, reason: "missing-token", failureStage: "transport" });
    const credential = digest({ endpoint: DECISION_ENDPOINT, token: this.#token });
    const failureScope = digest({ credential, scope: this.#healthScope });
    let pool: ProviderPool | undefined, lease: string | null = null, failureStage: DecisionFailureStage = "health-storage";
    const controller = new AbortController(), cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined, timeoutOwner = deadlineOwner;
    // Only local transactions may be retried. Cleanup shares one short allowance per call.
    let cleanupDeadline: number | undefined, providerFault = false;
    const coordinated = async <T>(action: () => T, until: number, cancelled?: AbortSignal): Promise<T> => {
      for (;;) try { return action(); } catch (error) {
        if (!contention(error) || performance.now() >= until || cancelled?.aborted) throw error;
        const start = performance.now(); await wait(Math.min(10, Math.max(1, until - start)), cancelled);
        timing.coordinationWaitMs += performance.now() - start;
      }
    };
    const cleanup = async (label: string, action: () => void) => {
      cleanupDeadline ??= performance.now() + 100;
      try { await coordinated(action, cleanupDeadline); } catch { timing.coordinationIssues.push(label); }
    };
    try {
      for (;;) {
        if (signal?.aborted) return done({ ok: false, reason: decisionCancellationReason(signal), failureStage: "transport" });
        if (performance.now() >= operationDeadline) return done({ ok: false, reason: "admission-deadline", failureStage: "budget" });
        const admissionStart = performance.now();
        let admission: ReturnType<ProviderPool["acquire"]>;
        try {
          pool ??= new ProviderPool(this.#root);
          admission = pool.acquire(credential, Buffer.byteLength(body), this.#now(), deadlineMs + PROVIDER_LEASE_CLEANUP_MS, failureScope);
        } catch (error) {
          if (!contention(error)) throw error;
          // Retry only a short local transaction, never a dispatched provider request.
          await wait(Math.min(10, Math.max(1, operationDeadline - performance.now())), signal);
          timing.coordinationWaitMs += performance.now() - admissionStart; continue;
        }
        if (admission.state === "suppressed") return done({ ok: false, reason: admission.reason, failureStage: "health-storage" });
        if (admission.state === "admitted") { lease = admission.id; timing.attemptId = lease; timing.activeConcurrency = admission.active; break; }
        const waiting = performance.now();
        await wait(Math.min(admission.waitMs, Math.max(1, operationDeadline - waiting)), signal);
        timing[admission.reason === "rate" ? "rateWaitMs" : "slotWaitMs"] += performance.now() - waiting;
      }
      if (performance.now() >= operationDeadline) return done({ ok: false, reason: "admission-deadline", failureStage: "budget" });
      // Coordination must succeed before paid reservation; a later local BUSY cannot burn an event.
      if (!await coordinated(() => pool!.dispatch(lease!, credential, this.#now(), deadlineMs + PROVIDER_LEASE_CLEANUP_MS, failureScope), operationDeadline, signal))
        return done({ ok: false, reason: "admission-expired-or-suppressed", failureStage: "health-storage" });
      if (signal?.aborted || performance.now() >= operationDeadline)
        return done({ ok: false, reason: signal?.aborted ? decisionCancellationReason(signal) : "admission-deadline", failureStage: "budget" });
      if (beforeDispatch && !beforeDispatch()) return done({ ok: false, reason: "admission-declined", failureStage: "budget" });
      if (signal?.aborted) return done({ ok: false, reason: decisionCancellationReason(signal), failureStage: "transport" });
      const remaining = Math.floor(Math.min(deadlineMs, operationDeadline - performance.now()));
      if (remaining < 1) return done({ ok: false, reason: "admission-deadline", failureStage: "budget" });
      // A caller-owned operation retains its original clock through admission and dispatch.
      // No request gains a fresh allowance after waiting for shared capacity.
      timeoutOwner = deadlineAt !== undefined && remaining < deadlineMs ? "caller" : deadlineOwner;
      timer = setTimeout(() => controller.abort(), remaining);
      httpStart = performance.now(); failureStage = "transport";
      onDispatch?.(); timing.dispatched = true; providerFault = true;
      const pending = this.#fetch(DECISION_ENDPOINT, { method: "POST",
        headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" }, body,
        signal: controller.signal, redirect: "error" });
      void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
      const response = await abortable(pending, controller.signal);
      timing.httpStatus = response.status;
      if (!response.ok) {
        const auth = response.status === 401 || response.status === 403, overload = response.status === 429 || response.status === 529;
        httpEnd = performance.now(); providerFault = false;
        void response.body?.cancel().catch(() => {});
        await cleanup("health-storage-unavailable", () => pool!.fail(credential, this.#now(), auth,
          overload ? retryDelay(response.headers.get("retry-after"), this.#now()) : 60000, overload ? "pool" : failureScope));
        return done({ ok: false, reason: auth ? "authentication-rejected" : response.status === 402 ? "billing-unavailable"
          : overload ? "provider-overloaded" : response.status >= 400 && response.status < 500 ? "request-rejected" : "provider-error", failureStage });
      }
      failureStage = "response-body";
      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty response");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const part = await abortable(reader.read(), controller.signal); if (part.done) break;
          size += part.value.byteLength;
          if (size > RESPONSE_LIMIT) { void reader.cancel().catch(() => {}); throw new Error("response budget exceeded"); }
          chunks.push(part.value);
        }
      } finally { if (controller.signal.aborted) void reader.cancel().catch(() => {}); reader.releaseLock(); }
      failureStage = "response-json";
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      httpEnd = performance.now(); providerFault = false;
      if (timer) clearTimeout(timer);
      await cleanup("usage-storage-unavailable", () => pool!.reportUsage(lease!, decisionNativeUsage(raw).inputTokens));
      if (controller.signal.aborted) return done({ ok: false, reason: signal?.aborted ? decisionCancellationReason(signal) : "deadline", failureStage });
      return done({ ok: true, raw });
    } catch {
      // Local contention/cancellation is not evidence of provider failure.
      httpEnd ??= performance.now();
      if (pool && providerFault && !signal?.aborted && !(controller.signal.aborted && timeoutOwner === "caller"))
        await cleanup("health-storage-unavailable", () => pool!.fail(credential, this.#now(), false, 60000, failureScope));
      return done({ ok: false, reason: signal?.aborted ? decisionCancellationReason(signal) : controller.signal.aborted ? "deadline" : providerFault ? "invalid-or-unavailable" : "provider-coordination-unavailable",
        failureStage: controller.signal.aborted && timeoutOwner === "caller" ? "budget" : failureStage });
    } finally {
      signal?.removeEventListener("abort", cancel); if (timer) clearTimeout(timer);
      if (lease && pool) await cleanup("release-storage-unavailable", () => pool!.release(lease!, timing.dispatched));
      try { pool?.close(); } catch { /* Closing advisory state cannot replace the selected fallback. */ }
      timing.totalMs = performance.now() - started;
    }
  }
}
