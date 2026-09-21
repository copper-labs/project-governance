import { readFileSync } from "node:fs";
import { join } from "node:path";
import { durableJson } from "./core.ts";

/** A run marker requests cancellation; only the command owner may signal its native process group. */
export function requestCheckCancellation(directory: string, id: string, authority: string) {
  if (!authority.trim()) throw new Error("Cancellation authority is required");
  const intent = JSON.parse(readFileSync(join(directory, "run.json"), "utf8"));
  if (intent.id !== id || intent.version !== 1) throw new Error("Cancellation run identity mismatch");
  durableJson(join(directory, "cancel.json"), { version: 1, run_id: id, authority, requested_at: new Date().toISOString() });
}
export function checkCancellationRequested(directory: string, id: string): boolean {
  try {
    const marker = JSON.parse(readFileSync(join(directory, "cancel.json"), "utf8"));
    return marker.version === 1 && marker.run_id === id && typeof marker.authority === "string" && Boolean(marker.authority.trim());
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw new Error("Cancellation record is unreadable"); }
}
