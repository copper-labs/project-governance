/**
 * Persists local context diagnostics under one write/read allowance, independently of model input.
 * Route preparation and prompt caching write here; native launch and entry replay read here.
 */
import { canonical, durableText, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { ContextRouteError } from "./context-route-errors.ts";

/** Retained inventory diagnostics are larger than the separate model-delivery packet. */
export const CONTEXT_RECORD_MAX_BYTES = 32 * 1024 * 1024;

/** Reuse the ordinary-file reader so retained state cannot bypass its bounded-read checks. */
export function readContextRecord(root: string, path: string): Record<string, unknown> {
  return object(JSON.parse(narrativeFile(root, path, CONTEXT_RECORD_MAX_BYTES)));
}

/** Use one allowance for receipt creation and replay; never publish an unreadable record. */
export function writeContextRecord(path: string, value: unknown): void {
  const encoded = `${canonical(value)}\n`;
  if (Buffer.byteLength(encoded) > CONTEXT_RECORD_MAX_BYTES)
    throw new ContextRouteError("context-record-byte-limit", "Retained context diagnostics exceed the 32 MiB local record allowance; no native review worker was launched.");
  durableText(path, encoded);
}
