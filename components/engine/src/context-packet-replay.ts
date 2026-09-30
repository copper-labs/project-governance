import { join } from "node:path";
import { digest, fileDigest, object } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";
import { readPromptEntry, latestSessionPrompt, promptEntryTaskBinding } from "./context-observations.ts";
import { ContextRouteError } from "./context-route-errors.ts";
import { resolveTaskContext } from "./decision-task-binding.ts";
import { sessionId } from "../../harness/src/store/location.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { validateProviderContext } from "./provider-context.ts";
import { LEGACY_PROMPT_BYTES, promptPacketLimit } from "./prompt-context-budget.ts";
import type { RoutedContextPacket } from "./context-route-command.ts";

/** A reference is explicit intent to read one observed packet, never an inferred shell turn. */
export function readPreparedPrompt(root: string, entryId: string, assetRoot: string, caller?: string) {
  const session = sessionId(caller);
  if (!session) throw new ContextRouteError("entry-session-unavailable", "Packet reuse requires the inherited host session and this prompt's entry reference.");
  const entry = readPromptEntry(root, entryId);
  if (entry.session !== session) throw new ContextRouteError("entry-session-mismatch", "This packet belongs to another chat. Use this session's native entry reference.");
  if (latestSessionPrompt(root, session).entry?.entryId !== entryId)
    throw new ContextRouteError("entry-superseded", "A newer or incomplete prompt supersedes this packet. Use current required originals; no selection was repeated.");
  const historical = promptEntryTaskBinding(root, entry), current = resolveTaskContext(root, { session }).context;
  if (historical && (historical.taskId !== current?.taskId || historical.revision !== current?.revision) || !historical && current)
    throw new ContextRouteError("entry-task-changed", "Task changed; refresh context through the normal route within the same allowance.");
  let packet: Record<string, unknown>;
  try { packet = object(JSON.parse(narrativeFile(contextStateRoot(root), join("prompt-packets", `${entryId}.json`)))); }
  catch { throw new ContextRouteError("entry-packet-unavailable", "The prepared packet is unavailable. Inspect current required originals; no selection was repeated."); }
  if (packet.version !== 1 || packet.entryId !== entryId || typeof packet.text !== "string" ||
      digest(packet.text) !== entry.packetDigest || digest(packet.validation) !== entry.replayValidationDigest)
    throw new ContextRouteError("entry-packet-invalid", "The prepared packet identity differs. Use the current originals; no selection was repeated.");
  let limit = LEGACY_PROMPT_BYTES;
  if (entry.status === "prepared") {
    const validation = object(packet.validation);
    if (validation.status !== "prepared-for-native-input" || validation.skillAssetRoot !== assetRoot)
      throw new ContextRouteError("entry-runtime-changed", "The packet's runtime assets changed. Refresh explicitly against the current runtime.");
    try {
      if (typeof validation.receipt !== "string" || fileDigest(validation.receipt) !== validation.receiptDigest) throw new Error("receipt changed");
      const receipt = object(JSON.parse(narrativeFile(contextStateRoot(root), validation.receipt)));
      if (receipt.contextBudget !== undefined) limit = promptPacketLimit(receipt.contextBudget, object(receipt.contextBudgetAuthority ?? {}).nativePacketBytes);
      validateProviderContext(root, validation, packet.text);
    } catch { throw new ContextRouteError("entry-source-stale", "The packet's captured sources or policy changed. Refresh explicitly within the same allowance."); }
  }
  if (Buffer.byteLength(packet.text) > limit) throw new ContextRouteError("entry-packet-invalid", "The prepared packet exceeds its declared envelope.");
  const route = packet.route == null ? null : object(packet.route);
  if (route && digest(route) !== entry.routePacketDigest)
    throw new ContextRouteError("entry-packet-invalid", "The cached route identity differs; no selection was repeated.");
  return { entry, text: packet.text, route: entry.status === "prepared" ? route as RoutedContextPacket | null : null };
}
