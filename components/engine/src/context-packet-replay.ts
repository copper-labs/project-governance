import { join } from "node:path";
import { digest, fileDigest, object } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";
import { readPromptEntry, latestSessionPrompt, promptEntryTaskBinding, promptAccountingFamily } from "./context-observations.ts";
import { ContextRouteError } from "./context-route-errors.ts";
import { resolveTaskContext } from "./decision-task-binding.ts";
import { sessionId } from "../../harness/src/store/location.ts";
import { readContextRecord } from "./context-records.ts";
import { PreparedContextValidationError, validateProviderContext } from "./provider-context.ts";
import { expansionIdentity, nextContextExpansion } from "./context-family.ts";
import { LEGACY_PROMPT_BYTES, promptPacketLimit } from "./prompt-context-budget.ts";
import type { RoutedContextPacket } from "./context-route-command.ts";

/** A reference is explicit intent to read one observed packet, never an inferred shell turn. */
export function readPreparedPrompt(root: string, entryId: string, assetRoot: string, caller?: string) {
  const session = sessionId(caller);
  if (!session) throw new ContextRouteError("entry-session-unavailable", "Packet reuse requires the inherited host session and this prompt's entry reference.");
  const entry = readPromptEntry(root, entryId);
  promptAccountingFamily(root, entry);
  if (entry.session !== session) throw new ContextRouteError("entry-session-mismatch", "This packet belongs to another chat. Use this session's native entry reference.");
  if (latestSessionPrompt(root, session).entry?.entryId !== entryId)
    throw new ContextRouteError("entry-superseded", "A newer or incomplete prompt supersedes this packet. Use current required originals; no selection was repeated.");
  const historical = promptEntryTaskBinding(root, entry), current = resolveTaskContext(root, { session }).context;
  if (historical && (historical.taskId !== current?.taskId || historical.revision !== current?.revision) || !historical && current)
    throw new ContextRouteError("entry-task-changed", "Task changed; refresh context through the normal route within the same allowance.");
  let packet: Record<string, unknown>;
  try { packet = readContextRecord(contextStateRoot(root), join("prompt-packets", `${entryId}.json`)); }
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
      if (typeof validation.receipt !== "string") throw new PreparedContextValidationError("Prepared receipt reference changed", "receipt-reference-invalid");
      let observed: string;
      try { observed = fileDigest(validation.receipt); }
      catch { throw new PreparedContextValidationError("Prepared receipt unavailable", "receipt-unavailable"); }
      if (observed !== validation.receiptDigest) throw new PreparedContextValidationError("Prepared receipt changed", "receipt-digest-changed");
      const receipt = readContextRecord(contextStateRoot(root), validation.receipt);
      if (receipt.contextBudget !== undefined) limit = promptPacketLimit(receipt.contextBudget, object(receipt.contextBudgetAuthority ?? {}).nativePacketBytes);
      validateProviderContext(root, validation, packet.text);
    } catch (cause) {
      const diagnostic = cause instanceof PreparedContextValidationError ? cause.diagnostic : { causeCode: "replay-validation-unclassified" };
      const stale = ["configuration-changed", "configuration-unavailable", "source-changed", "source-unavailable"].includes(diagnostic.causeCode);
      const error = new ContextRouteError(stale ? "entry-source-stale" : "entry-packet-invalid", stale
        ? "The packet's captured sources or policy changed. Refresh explicitly; provider selection shares this turn's remaining allowance and may fall back locally."
        : "The packet's retained receipt or delivery integrity could not be verified. Inspect its originals; no refresh or selection was admitted.",
        { stage: "packet-replay", referenceDigest: digest(entryId), referenceBytes: Buffer.byteLength(entryId),
          ...diagnostic });
      if (stale) try {
        expansionIdentity(root, entryId, session);
        error.recovery = { action: "refresh-current-entry", entryId, sharedAllowance: true, command: "context-route", requires: ["task"],
          arguments: ["--entry", entryId, "--expansion", String(nextContextExpansion(root, entryId))] };
      } catch { /* Readable historical packets do not grant expansion eligibility. */ }
      throw error;
    }
  }
  if (Buffer.byteLength(packet.text) > limit) throw new ContextRouteError("entry-packet-invalid", "The prepared packet exceeds its declared envelope.");
  const route = packet.route == null ? null : object(packet.route);
  if (route && digest(route) !== entry.routePacketDigest)
    throw new ContextRouteError("entry-packet-invalid", "The cached route identity differs; no selection was repeated.");
  return { entry, text: packet.text, route: entry.status === "prepared" ? route as RoutedContextPacket | null : null };
}
