import { canonical, text } from "./core.ts";

export interface MemoryScope { repository: string; workspace: string | null; task: string | null }
export type MemoryKind = "fact" | "intent" | "proposal" | "procedure" | "outcome";
export interface MemoryReference {
  version: 1; id: string; eventId: string; scope: MemoryScope; kind: MemoryKind;
  revision: string; contentDigest: string; origin: string; owner: string; observedAt: string;
  labelOrigin: "machine" | "agent" | "reviewer"; supersedes: string | null; withdrawn: boolean;
}
export interface ProjectionIdentity { generation: number; watermark: string; complete: boolean }
export interface MemoryQuery {
  scope: MemoryScope; purpose: string; generation: number; deadlineMs: number;
  maxResults: number; maxBytes: number; dataClasses: string[];
}
export interface MemoryResponse {
  version: 1; state: "ready" | "degraded" | "unavailable"; projection: ProjectionIdentity;
  candidates: MemoryReference[]; omissions: string[]; method: string;
}
export interface MemoryProvider {
  readonly id: string;
  capabilities(): { version: 1; project: boolean; retrieve: boolean; withdraw: boolean; cancellation: boolean };
  open(signal: AbortSignal): Promise<void>;
  project(events: readonly MemoryReference[], generation: number, signal: AbortSignal): Promise<ProjectionIdentity>;
  retrieve(query: MemoryQuery, signal: AbortSignal): Promise<unknown>;
  withdraw(ids: readonly string[], scope: MemoryScope, generation: number, signal: AbortSignal): Promise<ProjectionIdentity>;
  close(): Promise<void>;
}
export interface MemorySelection {
  candidates: MemoryReference[]; state: "ready" | "degraded" | "unavailable";
  omissions: string[]; durationMs: number; method: string | null;
}

/** Optional retrieval returns references only. The caller fetches authoritative bytes after selection. */
export async function retrieveMemory(provider: MemoryProvider | null, query: MemoryQuery,
  current: (candidate: MemoryReference) => boolean, signal?: AbortSignal): Promise<MemorySelection> {
  const start = Date.now();
  const fallback = (reason: string): MemorySelection => ({ candidates: [], state: "unavailable", omissions: [reason], durationMs: Date.now() - start, method: null });
  text(query.scope.repository, "repository namespace"); text(query.purpose, "retrieval purpose");
  if (!Number.isSafeInteger(query.generation) || query.generation < 0 ||
      !Number.isSafeInteger(query.deadlineMs) || query.deadlineMs < 1 || query.deadlineMs > 5000 ||
      !Number.isSafeInteger(query.maxResults) || query.maxResults < 1 || query.maxResults > 64 ||
      !Number.isSafeInteger(query.maxBytes) || query.maxBytes < 1 || query.maxBytes > 65536) throw new Error("invalid retrieval budget");
  if (!provider) return fallback("provider-disabled");
  if (signal?.aborted) return fallback("cancelled");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, query.deadlineMs);
  let abortListener: (() => void) | undefined;
  try {
    const capability = provider.capabilities();
    if (capability.version !== 1 || !capability.retrieve) return fallback("unsupported-capability");
    const stopped = new Promise<never>((_, reject) => {
      abortListener = () => reject(new Error("retrieval cancelled or deadline reached"));
      controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    const raw = await Promise.race([provider.retrieve(structuredClone(query), controller.signal), stopped]);
    if (controller.signal.aborted) return fallback("cancelled-or-deadline");
    if (!raw || typeof raw !== "object") return fallback("invalid-response");
    const response = raw as MemoryResponse;
    if (response.version !== 1 || !["ready", "degraded", "unavailable"].includes(response.state) ||
        !Array.isArray(response.candidates) || response.candidates.length > 64 ||
        !Array.isArray(response.omissions) || response.omissions.length > 64 || response.omissions.some(v => typeof v !== "string" || v.length > 512) ||
        typeof response.method !== "string" || response.method.length > 256 ||
        !response.projection || response.projection.generation !== query.generation || !response.projection.complete) return fallback("invalid-or-stale-projection");
    if (response.state === "unavailable") return fallback("provider-unavailable");
    const candidates: MemoryReference[] = [], seen = new Set<string>(), omissions = [...response.omissions];
    let bytes = 0;
    for (const candidate of response.candidates) {
      if (!validReference(candidate)) { omissions.push("invalid-reference"); continue; }
      if (candidate.scope.repository !== query.scope.repository ||
          (query.scope.workspace !== null && candidate.scope.workspace !== query.scope.workspace) ||
          (query.scope.task !== null && candidate.scope.task !== query.scope.task)) { omissions.push("scope-mismatch"); continue; }
      if (candidate.withdrawn || !current(candidate)) { omissions.push("withdrawn-or-stale-reference"); continue; }
      if (seen.has(candidate.id)) { omissions.push("duplicate-reference"); continue; }
      const size = Buffer.byteLength(canonical(candidate));
      if (candidates.length >= query.maxResults || bytes + size > query.maxBytes) { omissions.push("result-budget"); continue; }
      seen.add(candidate.id); bytes += size; candidates.push(structuredClone(candidate));
    }
    return { candidates, state: omissions.length || response.state === "degraded" ? "degraded" : "ready",
      omissions: [...new Set(omissions)], durationMs: Date.now() - start, method: response.method };
  } catch { return fallback(controller.signal.aborted ? "cancelled-or-deadline" : "provider-failed"); }
  finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel);
    if (abortListener) controller.signal.removeEventListener("abort", abortListener);
  }
}

function validReference(value: MemoryReference): boolean {
  if (!value || typeof value !== "object" || value.version !== 1 || !value.scope ||
      !["fact", "intent", "proposal", "procedure", "outcome"].includes(value.kind) ||
      !["machine", "agent", "reviewer"].includes(value.labelOrigin) || typeof value.withdrawn !== "boolean") return false;
  const bounded = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 4096;
  return [value.id, value.eventId, value.revision, value.origin, value.owner, value.observedAt, value.scope.repository].every(bounded) &&
    /^sha256:[a-f0-9]{64}$/.test(value.contentDigest) && Number.isFinite(Date.parse(value.observedAt)) &&
    (value.scope.workspace === null || bounded(value.scope.workspace)) && (value.scope.task === null || bounded(value.scope.task)) &&
    (value.supersedes === null || bounded(value.supersedes));
}
