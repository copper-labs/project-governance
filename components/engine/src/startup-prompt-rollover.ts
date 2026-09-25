import { realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { startupObservationOwner } from "./startup-observation-owner.ts";
import { startupEvent } from "./startup-event.ts";
import { captureStartupHostOwner, requireAbsentStartupHost, type StartupHostOwner } from "./startup-host-owner.ts";
import { StartupOwnerChanged, StartupTasks } from "./startup-tasks.ts";
import { promptContext } from "./prompt-context.ts";
import { contextStateRoot } from "./context-command.ts";
import { publishContextObservation } from "./context-observations.ts";
import { ContextRouteError, recordContextFailure } from "./context-route-errors.ts";

/**
 * A new native process may resume a session while its old startup reader still belongs to
 * the departed process. Only current-runtime prompt context may continue; this never
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
  if (preliminary.action !== "reserve") return false;
  const tasks = new StartupTasks(realpathSync(receipts));
  let prior: ReturnType<StartupTasks["owner"]>;
  try {
    if (tasks.workspace(preliminary.taskId) !== realpathSync(workspace)) return false;
    prior = tasks.owner(preliminary.taskId);
  } finally { tasks.close(); }
  if (!prior || prior.reader.registry !== realpathSync(registry) ||
      prior.reader.owner !== `startup-task:${preliminary.taskId}`) return false;
  const current = (options.capture ?? captureStartupHostOwner)(provider);
  if (!current || current.provider !== "codex" || current.host !== prior.host.host ||
      (current.pid === prior.host.pid && current.fingerprint === prior.host.fingerprint)) return false;
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
    if (digest(lock) !== installed.lockDigest) throw new Error("Prompt runtime differs from the active lock");
    return await prepare();
  } finally {
    try { if (reader) generations.release(reader.token, reader.owner); }
    finally { generations.close(); }
  }
}

/** A departed host can keep its startup reader while a proved current host receives prompt context. */
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
  try {
    if (admitNativeAfterOwnerRollover(error, provider, event, workspace, registry, receipts)) {
      const context = await withCurrentRuntimePrompt(workspace, registry, () => promptContext(provider, event, workspace));
      try { publishContextObservation(join(contextStateRoot(workspace), "context-observations",
        `${digest({ kind: "startup-owner-rollover", session: input.session_id, turn: input.turn_id }).slice(7)}.json`),
        { version: 1, kind: "startup-owner-rollover", status: "context-attempted", sessionDigest: digest(input.session_id),
          turnDigest: digest(input.turn_id), priorStartupOwner: "retained", createdAt: new Date().toISOString() }); }
      catch { /* Nonblocking analytics. */ }
      return context;
    }
  } catch { /* The old owner or current native process could not be proven; fail closed. */ }
  try { recordContextFailure(workspace, new ContextRouteError("prompt-lifecycle-unavailable", "Prompt lifecycle unavailable; inspect startup ownership and context doctor.")); }
  catch { /* Nonblocking analytics. */ }
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext:
    "Governance prompt lifecycle is unavailable. Inspect startup ownership and context doctor before task-specific work. No permission or task acceptance was granted." } };
}
