import { realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { RUNTIME_MAINTENANCE_MESSAGE, RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { startupObservationOwner } from "./startup-observation-owner.ts";
import { startupEvent } from "./startup-event.ts";
import { captureStartupHostOwner, requireAbsentStartupHost, type StartupHostOwner } from "./startup-host-owner.ts";
import { StartupOwnerChanged, StartupTasks } from "./startup-tasks.ts";
import { promptContext } from "./prompt-context.ts";
import { contextStateRoot } from "./context-command.ts";
import { publishContextObservation } from "./context-observations.ts";
import { ContextRouteError, recordContextFailure } from "./context-route-errors.ts";

export const PROMPT_RUNTIME_LOCK_MESSAGE = "Prompt runtime differs from the active lock";

/**
 * A new native process may resume a session while its old startup reader still belongs to
 * the prior process. Only current-runtime prompt context may continue; this never
 * transfers or releases the startup/update reservation.
 */
export function admitNativeAfterOwnerRollover(
  error: unknown, provider: string, event: unknown, workspace: string, registry: string, receipts: string,
  options: { capture?: (provider: string) => StartupHostOwner | null; absent?: (host: StartupHostOwner) => unknown } = {},
): boolean {
  if (!(error instanceof StartupOwnerChanged) || provider !== "codex" ||
      !event || typeof event !== "object" || Array.isArray(event) ||
      !["UserPromptSubmit", "SessionStart"].includes(String((event as { hook_event_name?: unknown }).hook_event_name))) return false;
  const preliminary = startupEvent(provider, event, workspace, false);
  if (preliminary.action !== "reserve") throw new ContextRouteError("native-event-unavailable", "A verified top-level native event is required.");
  const tasks = new StartupTasks(realpathSync(receipts));
  let prior: ReturnType<StartupTasks["owner"]>;
  try {
    if (tasks.workspace(preliminary.taskId) !== realpathSync(workspace))
      throw new ContextRouteError("startup-workspace-mismatch", "The prior startup reservation belongs to another workspace.");
    prior = tasks.owner(preliminary.taskId);
  } finally { tasks.close(); }
  if (!prior) throw new ContextRouteError("startup-owner-unavailable", "The recorded startup owner is unavailable.");
  if (prior.reader.registry !== realpathSync(registry) || prior.reader.owner !== `startup-task:${preliminary.taskId}`)
    throw new ContextRouteError("startup-registry-mismatch", "The recorded startup reader does not match this installation.");
  if (prior.host.provider !== "codex" || !prior.host.host || !Number.isSafeInteger(prior.host.pid) || prior.host.pid < 2 || !prior.host.fingerprint)
    throw new ContextRouteError("startup-owner-identity-invalid", "The prior startup host identity is invalid.");
  const current = (options.capture ?? captureStartupHostOwner)(provider);
  if (!current || current.provider !== "codex")
    throw new ContextRouteError("native-owner-unavailable", "The current native parent could not be verified.");
  if (current.host !== prior.host.host)
    throw new ContextRouteError("native-owner-host-mismatch", "The current native parent belongs to another host.");
  if (current.pid === prior.host.pid && current.fingerprint === prior.host.fingerprint)
    throw new ContextRouteError("startup-owner-unchanged", "The native parent did not change; inspect the original lifecycle refusal.");
  // Advisory context holds its own current-generation reader. It never needs to take
  // over the old reservation, which may belong to a still-live desktop/CLI process.
  if ((event as { hook_event_name?: unknown }).hook_event_name === "SessionStart")
    (options.absent ?? requireAbsentStartupHost)(prior.host);
  return true;
}

/** Keep the exact active generation pinned while the advisory prompt packet is prepared. */
export async function withCurrentRuntimePrompt<T>(workspace: string, registry: string, prepare: () => Promise<T>): Promise<T> {
  const generations = new RuntimeGenerations(realpathSync(registry));
  let reader: ReturnType<RuntimeGenerations["acquire"]> | undefined;
  try {
    // The hook can be killed before finally runs. Use the existing recoverable
    // observation identity so a verified absent process never strands a reader.
    reader = generations.acquire(startupObservationOwner(workspace));
    const installed = inspectRuntimeGeneration(reader.directory);
    const lock = compiledRuntimeLock(parse(narrativeFile(workspace, join(workspace, "config/governance/runtime.lock.yaml"))));
    if (digest(lock) !== installed.lockDigest) throw new Error(PROMPT_RUNTIME_LOCK_MESSAGE);
    return await prepare();
  } finally {
    try { if (reader) generations.release(reader.token, reader.owner); }
    finally { generations.close(); }
  }
}

/** A prior host keeps its startup reader while a proved current host receives prompt context. */
export async function nativeOwnerRolloverResult(error: unknown, provider: string, event: unknown,
  workspace: string, registry: string, receipts: string): Promise<unknown | undefined> {
  if (!event || typeof event !== "object" || Array.isArray(event)) return undefined;
  const input = event as { hook_event_name?: unknown; session_id?: unknown; turn_id?: unknown };
  if (input.hook_event_name === "SessionStart") {
    try { if (admitNativeAfterOwnerRollover(error, provider, event, workspace, registry, receipts)) return {}; }
    catch { /* Keep the ordinary lifecycle error when native identity or absence cannot be proved. */ }
    return undefined;
  }
  if (input.hook_event_name !== "UserPromptSubmit") return undefined;
  let stage = error instanceof StartupOwnerChanged ? "native-prompt-admission" : "startup-observation", failure = error;
  try {
    if (admitNativeAfterOwnerRollover(error, provider, event, workspace, registry, receipts)) {
      stage = "prompt-runtime";
      const context = await withCurrentRuntimePrompt(workspace, registry, () => {
        stage = "prompt-preparation";
        return promptContext(provider, event, workspace);
      });
      try { publishContextObservation(join(contextStateRoot(workspace), "context-observations",
        `${digest({ kind: "startup-owner-rollover", session: input.session_id, turn: input.turn_id }).slice(7)}.json`),
        { version: 1, kind: "startup-owner-rollover", status: "context-attempted", sessionDigest: digest(input.session_id),
          turnDigest: digest(input.turn_id), priorStartupOwner: "retained", createdAt: new Date().toISOString() }, workspace); }
      catch { /* Nonblocking analytics. */ }
      return context;
    }
    if (error instanceof StartupOwnerChanged) stage = "native-prompt-admission";
  } catch (caught) { failure = caught; }
  const causeCode = failure instanceof ContextRouteError && /^[a-z][a-z0-9-]{0,79}$/u.test(failure.code) ? failure.code
    : failure instanceof StartupOwnerChanged ? "startup-owner-changed"
    : failure instanceof Error && failure.message === RUNTIME_MAINTENANCE_MESSAGE ? "runtime-maintenance"
    : failure instanceof Error && failure.message === PROMPT_RUNTIME_LOCK_MESSAGE ? "runtime-lock-mismatch"
    : "lifecycle-cause-unclassified";
  let receiptPath: string | null = null;
  try { receiptPath = recordContextFailure(workspace, new ContextRouteError("prompt-lifecycle-unavailable", "Prompt lifecycle unavailable; inspect startup ownership and context doctor.",
    { stage, causeCode, ...(typeof input.session_id === "string" ? { sessionDigest: digest(input.session_id) } : {}),
      ...(typeof input.turn_id === "string" ? { turnDigest: digest(input.turn_id) } : {}) })).receiptPath; }
  catch { /* Nonblocking analytics. */ }
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext:
    `Governance prompt lifecycle is unavailable (${stage}: ${causeCode}). Inspect startup ownership and context doctor before task-specific work.${receiptPath ? ` Failure receipt: ${receiptPath}.` : ""} No permission or task acceptance was granted.` } };
}
