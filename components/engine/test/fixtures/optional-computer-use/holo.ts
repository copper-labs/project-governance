import { isIP } from "node:net";

export interface HoloConfiguration {
  endpoint: string; model: string; revision: string; quantization: string; projectorSha256: string;
  modelSha256: string; runtime: "llama.cpp"; runtimeVersion: string; deadlineMs: number;
}
export interface Point { x: number; y: number }
export type HoloFetch = (url: string, init: RequestInit) => Promise<Response>;
export class PilotFailure extends Error {
  readonly reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}
const pointSchema = { type: "object", additionalProperties: false, required: ["x", "y"], properties: {
  x: { type: "integer", minimum: 0, maximum: 1000 }, y: { type: "integer", minimum: 0, maximum: 1000 },
} };
export function aborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new PilotFailure("cancelled-or-timeout"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new PilotFailure("cancelled-or-timeout"));
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Literal addresses avoid DNS and URL host shorthand; loopback is a declaration, not locality attestation. */
export function localEndpoint(value: string): string {
  const rawHost = /^http:\/\/(\[[^\]]+\]|[^/:]+)(?::\d+)?\/v1\/?$/u.exec(value)?.[1];
  if (!rawHost) throw new PilotFailure("configuration-invalid");
  const host = rawHost.replace(/^\[|\]$/gu, "");
  if (!(isIP(host) === 4 && host.startsWith("127.") || isIP(host) === 6 && host === "::1"))
    throw new PilotFailure("configuration-invalid");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new PilotFailure("configuration-invalid");
  return value.replace(/\/$/u, "");
}
export function configuration(value: unknown): HoloConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PilotFailure("configuration-invalid");
  const v = value as Record<string, unknown>;
  const fields = ["endpoint", "model", "revision", "quantization", "projectorSha256", "modelSha256", "runtime", "runtimeVersion", "deadlineMs"];
  if (Object.keys(v).some(key => !fields.includes(key)) || fields.some(key => !(key in v))) throw new PilotFailure("configuration-invalid");
  for (const key of fields.filter(key => key !== "deadlineMs"))
    if (typeof v[key] !== "string" || !(v[key] as string).trim() || (v[key] as string).length > 512) throw new PilotFailure("configuration-invalid");
  if (v["runtime"] !== "llama.cpp" || !/^[a-f0-9]{64}$/u.test(String(v["projectorSha256"])) ||
    !/^[a-f0-9]{64}$/u.test(String(v["modelSha256"])) || !Number.isSafeInteger(v["deadlineMs"]) ||
    Number(v["deadlineMs"]) <= 0 || Number(v["deadlineMs"]) > 300_000) throw new PilotFailure("configuration-invalid");
  return { ...v, endpoint: localEndpoint(String(v["endpoint"])) } as unknown as HoloConfiguration;
}
export function strictPoint(value: unknown): Point {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PilotFailure("coordinates-invalid");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "x,y" || ![v["x"], v["y"]].every(n => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1000))
    throw new PilotFailure("coordinates-invalid");
  return { x: v["x"] as number, y: v["y"] as number };
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.redirected || response.status >= 300 && response.status < 400) throw new PilotFailure("redirect-rejected");
  if (!response.ok) throw new PilotFailure("service-unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new PilotFailure("response-invalid");
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new PilotFailure("cancelled-or-timeout");
      const part = await aborted(reader.read(), signal); if (part.done) break;
      size += part.value.length;
      if (size > 64 * 1024) { await reader.cancel(); throw new PilotFailure("response-too-large"); }
      chunks.push(part.value);
    }
    if (signal.aborted) throw new PilotFailure("cancelled-or-timeout");
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PilotFailure("response-invalid"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export class HoloClient {
  readonly config: HoloConfiguration;
  private readonly fetcher: HoloFetch;
  constructor(value: unknown, fetcher: HoloFetch = fetch) { this.config = configuration(value); this.fetcher = fetcher; }
  inspect() { return { configured: this.config, observedModel: null, loadedWeightsVerified: false, imageSupportVerified: false }; }
  private async request(path: string, method: string, body: string | undefined, cancelled?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.config.deadlineMs);
    const signal = cancelled ? AbortSignal.any([timeout, cancelled]) : timeout;
    if (signal.aborted) throw new PilotFailure("cancelled-or-timeout");
    try {
      const response = await aborted(this.fetcher(this.config.endpoint + path, { method, redirect: "error", signal,
        headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body }) }), signal);
      return await boundedJson(response, signal);
    } catch (error) {
      if (error instanceof PilotFailure) throw error;
      throw new PilotFailure(signal.aborted ? "cancelled-or-timeout" : "service-unavailable");
    }
  }
  async readiness(signal?: AbortSignal) {
    const result = await this.request("/models", "GET", undefined, signal) as { data?: Array<{ id?: string }> };
    if (!Array.isArray(result?.data) || !result.data.some(model => model.id === this.config.model)) throw new PilotFailure("model-incompatible");
    return { observedModel: this.config.model, loadedWeightsVerified: false, imageSupportVerified: false };
  }
  async ground(bytes: Buffer, target: string, signal?: AbortSignal): Promise<Point> {
    if (!target.trim() || target.length > 4096 || !bytes.length || bytes.length > 32 * 1024 * 1024) throw new PilotFailure("request-invalid");
    // Only these supplied bytes and the scripted target enter the model request. No browser history or state oracle.
    const body = JSON.stringify({ model: this.config.model, temperature: 0, stream: false, max_tokens: 128,
      chat_template_kwargs: { enable_thinking: false }, response_format: { type: "json_schema", schema: pointSchema },
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: "data:image/png;base64," + bytes.toString("base64") } },
        { type: "text", text: `Locate this control. Return only integer x,y in 0..1000: ${target}` },
      ] }] });
    const result = await this.request("/chat/completions", "POST", body, signal) as {
      model?: string; choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown; function_call?: unknown } }>;
    };
    if (result?.model !== this.config.model || result.choices?.length !== 1) throw new PilotFailure("model-incompatible");
    const message = result.choices[0]?.message;
    if (!message || message.tool_calls !== undefined || message.function_call !== undefined || typeof message.content !== "string")
      throw new PilotFailure("response-invalid");
    let value: unknown; try { value = JSON.parse(message.content); } catch { throw new PilotFailure("coordinates-invalid"); }
    return strictPoint(value);
  }
}

export function availability(runId: string, required: boolean, reason: string, invalid = false) {
  const blocking = required || invalid;
  return { exitCode: blocking ? 1 : 0, envelope: { status: blocking ? "failed" : "warning", findings: [{
    rule_id: invalid ? "computer-use.configuration-invalid" : "computer-use.not-run", severity: blocking ? "blocking" : "advisory",
    coverage: "not-run", reason, run_id: runId,
  }] } };
}
export function minimalDriverEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(["PATH", "TMPDIR", "TEMP", "TMP"].flatMap(key => env[key] ? [[key, env[key]!]] : []));
}
