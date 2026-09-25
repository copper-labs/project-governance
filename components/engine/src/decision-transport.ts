import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { digest, durableJson, object } from "./core.ts";
import type { DecisionFailureStage } from "./decision-schema.ts";

export const DECISION_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const RESPONSE_LIMIT = 262_144;

export interface TransportOptions { token?: string | undefined; fetch?: typeof fetch; now?: () => number }
export type TransportOutcome =
  | { ok: true; raw: unknown }
  | { ok: false; reason: string; failureStage: DecisionFailureStage };
interface Health { config: string; authRejected: boolean; retryAfter: number; lastFailure: string | null }

/** A deliberate config revision opens a fresh health epoch without deleting another process's lock. */
export function decisionProviderHealthPath(base: string, configId: string): string {
  return `${base}.${digest(configId).slice(7, 39)}`;
}

/** Also bound injected transports and stalled response streams that ignore abort themselves. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Decision transport aborted"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * One bounded HTTP call for the expanded contract. Cross-process health suppression, cancellation and
 * deadline handling match the existing adapter: a busy provider never blocks a consumer's baseline.
 */
export class JevDecisionClient {
  readonly #healthPath: string;
  readonly #token: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #configId: string;
  constructor(configId: string, healthPath: string, options: TransportOptions = {}) {
    this.#configId = configId; this.#healthPath = decisionProviderHealthPath(healthPath, configId);
    this.#token = options.token ?? process.env["JEV_TOKEN"];
    this.#fetch = options.fetch ?? fetch; this.#now = options.now ?? Date.now;
  }
  get tokenPresent(): boolean { return Boolean(this.#token); }

  async ask(body: string, deadlineMs: number, signal?: AbortSignal, beforeDispatch?: () => boolean, onDispatch?: () => void,
    deadlineOwner: "provider" | "caller" = "provider"): Promise<TransportOutcome> {
    const started = performance.now();
    if (signal?.aborted) return { ok: false, reason: "cancelled", failureStage: "transport" };
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000) return { ok: false, reason: "invalid-deadline", failureStage: "transport" };
    if (!this.#token) return { ok: false, reason: "missing-token", failureStage: "transport" };
    const lock = `${this.#healthPath}.lock`;
    let locked = false, failureStage: DecisionFailureStage = "health-storage";
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      mkdirSync(dirname(this.#healthPath), { recursive: true, mode: 0o700 });
      try { mkdirSync(lock, { mode: 0o700 }); locked = true; }
      catch { return { ok: false, reason: "provider-busy-or-health-unavailable", failureStage: "health-storage" }; }
      let health: Health = { config: this.#configId, authRejected: false, retryAfter: 0, lastFailure: null };
      if (existsSync(this.#healthPath)) {
        if (statSync(this.#healthPath).size > 16_384) return { ok: false, reason: "health-unavailable", failureStage: "health-storage" };
        const raw = object(JSON.parse(readFileSync(this.#healthPath, "utf8")));
        if (typeof raw["config"] !== "string" || typeof raw["authRejected"] !== "boolean" ||
            typeof raw["retryAfter"] !== "number" || !Number.isFinite(raw["retryAfter"])) return { ok: false, reason: "health-unavailable", failureStage: "health-storage" };
        if (raw["config"] === this.#configId) health = raw as unknown as Health;
      }
      if (health.authRejected) return { ok: false, reason: "authentication-disabled", failureStage: "health-storage" };
      if (health.retryAfter > this.#now()) return { ok: false, reason: "cooldown", failureStage: "health-storage" };
      // Reserve only after the local gate has admitted transport, immediately before dispatch.
      if (beforeDispatch && !beforeDispatch()) return { ok: false, reason: "admission-declined", failureStage: "budget" };
      if (signal?.aborted) return { ok: false, reason: "cancelled", failureStage: "transport" };
      const remaining = deadlineMs - (performance.now() - started);
      if (remaining <= 0) return { ok: false, reason: "deadline", failureStage: "budget" };
      timer = setTimeout(() => controller.abort(), remaining);
      failureStage = "transport";
      onDispatch?.();
      const response = await abortable(this.#fetch(DECISION_ENDPOINT, { method: "POST",
        headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" },
        body, signal: controller.signal, redirect: "error" }), controller.signal);
      if (signal?.aborted) { void response.body?.cancel().catch(() => {}); return { ok: false, reason: "cancelled", failureStage: "transport" }; }
      if (!response.ok) {
        const authRejected = response.status === 401 || response.status === 403;
        // Rate limiting and overload are suppressed separately from authentication and invalid responses.
        const overload = response.status === 429 || response.status === 529;
        const retryAfter = Number(response.headers.get("retry-after"));
        const cooldown = overload && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 300) * 1000 : 60_000;
        durableJson(this.#healthPath, { config: this.#configId, authRejected, retryAfter: this.#now() + cooldown,
          lastFailure: authRejected ? "auth" : overload ? `overload-${response.status}` : `http-${response.status}` });
        void response.body?.cancel().catch(() => {});
        return { ok: false, reason: authRejected ? "authentication-rejected" : overload ? "provider-overloaded" : "provider-error", failureStage: "transport" };
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
      } finally {
        if (controller.signal.aborted) void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      failureStage = "response-json";
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (controller.signal.aborted) return { ok: false, reason: signal?.aborted ? "cancelled" : "deadline", failureStage: "response-json" };
      durableJson(this.#healthPath, { config: this.#configId, authRejected: false, retryAfter: 0, lastFailure: null });
      return { ok: true, raw };
    } catch {
      // Exhausting a caller's total retrieval allowance is not evidence that the provider is unhealthy.
      if (locked && !signal?.aborted && !(controller.signal.aborted && deadlineOwner === "caller")) {
        try { durableJson(this.#healthPath, { config: this.#configId, authRejected: false, retryAfter: this.#now() + 60_000,
          lastFailure: controller.signal.aborted ? "deadline" : "invalid-or-unavailable", failureStage }); }
        catch { /* Advisory storage cannot block baseline delivery. */ }
      }
      return { ok: false, reason: signal?.aborted ? "cancelled" : controller.signal.aborted ? "deadline" : "invalid-or-unavailable",
        failureStage: controller.signal.aborted && deadlineOwner === "caller" ? "budget" : failureStage };
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (timer) clearTimeout(timer);
      if (locked) { try { rmdirSync(lock); } catch { /* An orphaned advisory lock suppresses calls until reset. */ } }
    }
  }
}
