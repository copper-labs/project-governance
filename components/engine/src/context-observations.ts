import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, linkSync, unlinkSync, opendirSync } from "node:fs";
import { join, isAbsolute, basename, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { digest, durableJson, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { contextStateRoot } from "./context-command.ts";
import { safeSubjectPath, worktreeBytes } from "./change-subject.ts";
import { localContextPath } from "./context-path-policy.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, sessionId, workContext } from "../../harness/src/store/location.ts";
import type { TaskBindingObservation } from "../../harness/src/cli.ts";
import { resolveTaskContext, taskBindingReceipt, type TaskBindingReceipt } from "./decision-task-binding.ts";
import type { DecisionTaskContext } from "./decision-task-context.ts";
import { recentReceipts } from "./telemetry-receipt-reader.ts";
import { projectContextMetric, readContextProjection } from "./telemetry-projection.ts";
import { ContextRouteError } from "./context-route-errors.ts";
import { DocumentationObservations } from "./context-documentation.ts";
import { runtimeExecutionIdentity } from "./runtime-execution-identity.ts";
import { readContextRecord } from "./context-records.ts";

const ID = /^[a-f0-9]{64}$/u;
const read = (directory: string, name: string) => object(JSON.parse(narrativeFile(directory, name)));
export function promptTurnKey(provider: string, workspace: string, worktreeLocator: string, session: string, turn: string) {
  return digest({ provider, workspace, worktreeLocator, session, turn }).slice(7);
}

/** The first immutable turn claim owns accounting; subsequent inputs cannot mint a pool. */
export function readPromptTurnReservation(workspace: string, provider: string, session: string, turn: string) {
  const root = realpathSync(workspace), worktreeLocator = workContext(root).locator;
  const key = promptTurnKey(provider, root, worktreeLocator, session, turn);
  const directory = join(contextStateRoot(root), "prompt-preparations", digest(session).slice(7));
  const marker = object(JSON.parse(narrativeFile(directory, `${key}.json`, 4096)));
  const identity = { provider, workspace: root, session, turn, worktreeLocator, promptDigest: marker.promptDigest };
  if (marker.version !== 1 || marker.provider !== provider || marker.workspace !== root || marker.session !== session ||
      marker.turn !== turn || marker.worktreeLocator !== worktreeLocator || typeof marker.promptDigest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(marker.promptDigest) || marker.entryId !== digest(identity).slice(7) ||
      !Number.isSafeInteger(Date.parse(String(marker.submittedAt)))) throw new ContextRouteError("entry-family-invalid", "The original prompt accounting claim cannot be verified; no paid selection is admitted.");
  return { marker, key, directory, digest: digest(marker) };
}

function promptOccurrenceId(marker: Record<string, unknown>) {
  return digest({ provider: marker.provider, workspace: marker.workspace, session: marker.session, turn: marker.turn,
    worktreeLocator: marker.worktreeLocator, promptDigest: marker.promptDigest,
    ...(marker.predecessor === undefined ? {} : { predecessor: marker.predecessor }) }).slice(7);
}

/** Only the immediate ordering original is checked. It grants no budget or execution authority. */
export function readPromptClaim(claim: ReturnType<typeof readPromptTurnReservation>, entryId: string) {
  if (!ID.test(entryId)) throw new ContextRouteError("entry-family-invalid", "The current native occurrence is invalid.");
  if (entryId === claim.marker.entryId) return claim.marker;
  const marker = read(claim.directory, `${claim.key}-${entryId}.json`), anchor = object(marker.accountingAnchor), predecessor = object(marker.predecessor);
  const sameTurn = (value: Record<string, unknown>) => ["provider", "workspace", "worktreeLocator", "session", "turn"].every(key => value[key] === claim.marker[key]);
  if (marker.version !== 1 || marker.entryId !== entryId || marker.familyId !== claim.marker.entryId || !sameTurn(marker) ||
      typeof marker.promptDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(marker.promptDigest) || promptOccurrenceId(marker) !== entryId ||
      !Number.isSafeInteger(Date.parse(String(marker.submittedAt))) || anchor.entryId !== claim.marker.entryId || anchor.reservationDigest !== claim.digest ||
      typeof anchor.ready !== "boolean" || anchor.entryDigest !== null && !/^sha256:[a-f0-9]{64}$/u.test(String(anchor.entryDigest)) ||
      !ID.test(String(predecessor.entryId)) || predecessor.entryId === entryId)
    throw new ContextRouteError("entry-family-invalid", "The current native occurrence cannot be verified.");
  const prior = predecessor.entryId === claim.marker.entryId ? claim.marker : read(claim.directory, `${claim.key}-${predecessor.entryId}.json`);
  if (!sameTurn(prior) || prior.entryId !== predecessor.entryId || promptOccurrenceId(prior) !== prior.entryId ||
      (prior.entryId !== claim.marker.entryId && (prior.familyId !== claim.marker.entryId || object(prior.accountingAnchor).reservationDigest !== claim.digest)) ||
      digest(prior) !== predecessor.claimDigest)
    throw new ContextRouteError("entry-family-invalid", "The immediate native predecessor cannot be verified.");
  return marker;
}

/** Completion is frozen when the steered claim is made; an in-flight parent cannot qualify it later. */
export function promptAnchorState(workspace: string, marker: Record<string, unknown>) {
  let entry: Record<string, unknown> | null = null;
  try {
    entry = readPromptEntry(workspace, String(marker.entryId));
    if (entry.provider !== marker.provider || entry.session !== marker.session || entry.turn !== marker.turn ||
        entry.worktreeLocator !== marker.worktreeLocator || entry.promptDigest !== marker.promptDigest ||
        entry.submittedAt !== marker.submittedAt || entry.familyId && entry.familyId !== entry.entryId) throw new Error("anchor identity differs");
    const packet = readContextRecord(contextStateRoot(workspace), join("prompt-packets", `${entry.entryId}.json`));
    if (entry.status !== "prepared" || packet.version !== 1 || packet.entryId !== entry.entryId || typeof packet.text !== "string" ||
        digest(packet.text) !== entry.packetDigest || digest(packet.validation) !== entry.replayValidationDigest ||
        digest(packet.route) !== entry.routePacketDigest || object(packet.validation).status !== "prepared-for-native-input")
      throw new Error("anchor packet is incomplete");
    return { entry, entryDigest: digest(entry), ready: true, reason: null };
  } catch { return { entry, entryDigest: entry ? digest(entry) : null, ready: false, reason: "original-preparation-unavailable-or-incomplete" }; }
}

/** Validate an explicit current entry against its original same-turn accounting anchor. */
export function promptAccountingFamily(workspace: string, entry: Record<string, unknown>) {
  const familyId = entry.familyId === undefined ? String(entry.entryId) : String(entry.familyId);
  if (!ID.test(familyId)) throw new ContextRouteError("entry-family-invalid", "The prompt accounting family is invalid.");
  if (familyId === entry.entryId) {
    if (entry.accountingAnchor != null) throw new ContextRouteError("entry-family-invalid", "A steered input cannot replace its original accounting family.");
    try {
      const original = readPromptTurnReservation(workspace, String(entry.provider), String(entry.session), String(entry.turn));
      if (original.marker.entryId !== familyId || original.marker.promptDigest !== entry.promptDigest || original.marker.submittedAt !== entry.submittedAt)
        throw new ContextRouteError("entry-family-invalid", "A steered input cannot open a separate accounting family.");
    } catch (error) { if (entry.familyId !== undefined || error instanceof ContextRouteError) throw error; }
    return { familyId, ready: true };
  }
  const claim = readPromptTurnReservation(workspace, String(entry.provider), String(entry.session), String(entry.turn));
  const reference = object(entry.accountingAnchor), marker = readPromptClaim(claim, String(entry.entryId));
  const anchor = promptAnchorState(workspace, claim.marker);
  if (claim.marker.entryId !== familyId || reference.entryId !== familyId || reference.reservationDigest !== claim.digest ||
      marker.entryId !== entry.entryId || marker.familyId !== familyId || marker.submittedAt !== entry.submittedAt ||
      digest(marker.accountingAnchor) !== digest(reference) || marker.provider !== entry.provider || marker.workspace !== entry.workspace ||
      marker.worktreeLocator !== entry.worktreeLocator || marker.session !== entry.session || marker.turn !== entry.turn || marker.promptDigest !== entry.promptDigest ||
      digest(marker.predecessor) !== digest(entry.predecessor) || promptOccurrenceId(entry) !== entry.entryId ||
      reference.entryDigest !== null && reference.entryDigest !== anchor.entryDigest)
    throw new ContextRouteError("entry-family-invalid", "This prompt's original accounting relation cannot be verified; no paid selection is admitted.");
  return { familyId, ready: reference.ready === true && reference.entryDigest !== null && anchor.ready };
}
function observationGenerations(entry?: Record<string, unknown>) {
  return { collectorGeneration: runtimeExecutionIdentity(), promptGeneration: entry ? {
    runtimeVersion: typeof entry.runtimeVersion === "string" ? entry.runtimeVersion : null,
    archiveDigest: typeof entry.archiveDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(entry.archiveDigest) ? entry.archiveDigest : null,
  } : null };
}

/** A rebuildable per-session pointer avoids scanning other sessions on the host exit path. */
export function indexPromptEntry(workspace: string, entryId: string, session: string, turn: string, submittedAt = new Date().toISOString()) {
  if (!ID.test(entryId)) throw new Error("Invalid prompt entry ID");
  const at = Date.parse(submittedAt);
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("Invalid prompt entry time");
  const directory = join(contextStateRoot(workspace), "prompt-session-index", digest(session).slice(7));
  durableJson(join(directory, `${String(at).padStart(16, "0")}-${digest(turn).slice(7)}-${entryId}.json`), { entryId });
}

function entryIndexName(name: string) {
  const match = /^(?:(\d{16})-)?([a-f0-9]{64})-([a-f0-9]{64})\.json$/u.exec(name);
  return match ? { time: match[1] ? Number(match[1]) : null, turn: match[2]!, entryId: match[3]! } : null;
}

export function publishContextObservation(path: string, value: unknown, workspace?: string): boolean {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    durableJson(temporary, value);
    try {
      linkSync(temporary, path);
      if (workspace) try {
        const record = object(value), state = contextStateRoot(workspace);
        if (dirname(path) === join(state, "context-observations") &&
            ["task-binding", "task-refresh", "task-switch", "startup-owner-rollover"].includes(String(record.kind))) {
          const binding = record.binding && typeof record.binding === "object" && !Array.isArray(record.binding)
            ? record.binding as Record<string, unknown> : {};
          const entryId = typeof record.entryId === "string" ? record.entryId : null;
          let familyId: string | null = null;
          if (entryId) try { familyId = promptAccountingFamily(workspace, readPromptEntry(workspace, entryId)).familyId; } catch { /* Missing original accounting stays unknown. */ }
          projectContextMetric(state, { id: basename(path, ".json"), workspace: realpathSync(workspace), capturedAt: String(record.createdAt),
            kind: "observation", entryId, familyId, routeId: null,
            taskId: typeof binding.taskId === "string" ? binding.taskId : null,
            taskRevision: typeof binding.revision === "string" ? binding.revision : null,
            status: String(record.kind), reason: null, counts: {} });
        }
      } catch { /* The immutable observation still owns proof if its compact projection fails. */ }
      return true;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
  } finally { try { unlinkSync(temporary); } catch { /* A failed write may not have created a file. */ } }
}

/** Read explicit entry identities; a current ambient task cannot retarget historical observations. */
export function readPromptEntry(workspace: string, id: string) {
  const reference = { referenceDigest: digest(id), referenceBytes: Buffer.byteLength(id) };
  if (!ID.test(id)) throw new ContextRouteError("entry-malformed", "Use the exact 64-character entry reference from the native context packet. No selection was repeated.",
    { stage: "entry-reference", causeCode: "entry-reference-format", ...reference });
  let entry: Record<string, unknown>;
  try { entry = read(join(contextStateRoot(workspace), "prompt-entries"), `${id}.json`); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new ContextRouteError("entry-unavailable-in-workspace", `Entry is unavailable in ${realpathSync(workspace)}. Align this chat and its commands with the same execution worktree; no sibling lookup or paid retry was attempted.`);
    throw new ContextRouteError("entry-unreadable", "The local entry cannot be read safely. Inspect context doctor and the current required originals.");
  }
  if (entry.version !== 1) throw new ContextRouteError("entry-format-unsupported", "The local entry format is unsupported. Use the current native packet reference.");
  if (entry.workspace !== realpathSync(workspace))
    throw new ContextRouteError("entry-workspace-mismatch", `The recorded workspace differs from execution workspace ${realpathSync(workspace)}. Align the host at a pause seam.`);
  if (entry.entryId !== id || typeof entry.session !== "string" || typeof entry.turn !== "string")
    throw new ContextRouteError("entry-malformed", "The local entry identity is malformed; inspect the current packet reference.",
      { stage: "entry-record", causeCode: "entry-record-identity", ...reference });
  if (entry.worktreeLocator !== workContext(workspace).locator)
    throw new ContextRouteError("entry-worktree-identity-changed", "The checkout identity changed. Use a native prompt in the verified execution worktree.");
  return entry;
}

/** Inspect only this session; incomplete or ambiguous inventory cannot choose an older entry. */
export function latestSessionPrompt(workspace: string, session: string) {
  const directory = join(contextStateRoot(workspace), "prompt-preparations", digest(session).slice(7));
  let handle: ReturnType<typeof opendirSync> | undefined;
  try {
    handle = opendirSync(directory);
    const turns: Array<{ time: number; entryId: string; turn: string; marker: Record<string, unknown> }> = [];
    const started = Date.now(); let count = 0;
    for (let file = handle.readSync(); file; file = handle.readSync()) {
      if (++count > 10000 || Date.now() - started > 1000) return { reason: "session-entry-scan-incomplete" };
      if (!/^(?:[a-f0-9]{64}-)?[a-f0-9]{64}\.json$/u.test(file.name)) continue;
      if (lstatSync(join(directory, file.name)).size > 4096) return { reason: "session-entry-scan-incomplete" };
      const marker = read(directory, file.name), time = Date.parse(String(marker.submittedAt));
      if (marker.session !== session || !Number.isSafeInteger(time) || !ID.test(String(marker.entryId)) ||
          typeof marker.turn !== "string") return { reason: "session-entry-identity-unverified" };
      turns.push({ time, entryId: String(marker.entryId), turn: marker.turn, marker });
    }
    turns.sort((a, b) => b.time - a.time);
    const selectedTurn = turns[0];
    if (!selectedTurn) return { reason: "session-entry-unavailable" };
    if (turns.some(row => row.time === selectedTurn.time && row.turn !== selectedTurn.turn)) return { reason: "session-entry-ambiguous" };
    const occurrences = turns.filter(row => row.turn === selectedTurn.turn);
    const predecessors = new Map<string, string>();
    for (const row of occurrences.filter(row => row.marker.predecessor)) {
      const predecessor = String(object(row.marker.predecessor).entryId), prior = predecessors.get(predecessor);
      if (prior && prior !== row.entryId) return { reason: "session-entry-ambiguous" };
      predecessors.set(predecessor, row.entryId);
    }
    // Native turn ordering still uses the retained host timestamps. Within one turn,
    // the immutable predecessor relation owns order even when its clock ties or moves backwards.
    const heads = occurrences.filter(row => !predecessors.has(row.entryId));
    if (heads.length !== 1) return { reason: "session-entry-ambiguous" };
    const newest = heads[0]!;
    const path = join(contextStateRoot(workspace), "prompt-entries", `${newest.entryId}.json`);
    if (!lstatSync(path, { throwIfNoEntry: false })) return { reason: "session-entry-superseded", entryId: newest.entryId };
    if (lstatSync(path).size > 65536) return { reason: "session-entry-scan-incomplete" };
    const entry = readPromptEntry(workspace, newest.entryId);
    if (entry.session !== session || entry.turn !== newest.turn ||
        typeof entry.submittedAt !== "string" || Date.parse(entry.submittedAt) !== newest.time)
      return { reason: "session-entry-identity-unverified" };
    if (entry.familyId && entry.familyId !== entry.entryId) promptAccountingFamily(workspace, entry);
    return { entry, entryId: newest.entryId, reason: "session-entry-found" };
  } catch (error) { return { reason: error instanceof ContextRouteError ? error.code : "session-entry-unavailable" }; }
  finally { handle?.closeSync(); }
}

/** Historical association only; callers must separately resolve current execution authority. */
export function promptEntryTaskBinding(workspace: string, entry: ReturnType<typeof readPromptEntry>): TaskBindingReceipt | null {
  if (entry.scopeKind === "bound-task") return object(entry.binding) as unknown as TaskBindingReceipt;
  try {
    const association = read(join(contextStateRoot(workspace), "context-observations"), `${digest({ kind: "task-binding", entryId: entry.entryId }).slice(7)}.json`);
    if (association.version !== 1 || association.kind !== "task-binding" || association.entryId !== entry.entryId ||
        association.entryDigest !== digest(entry) || association.session !== entry.session ||
        association.worktreeLocator !== entry.worktreeLocator) return null;
    const binding = object(association.binding);
    if (binding.status !== "bound" || binding.source !== "session" || typeof binding.taskId !== "string" ||
        typeof binding.revision !== "string" || typeof binding.attemptId !== "string") return null;
    return binding as unknown as TaskBindingReceipt;
  } catch { return null; }
}

const refreshId = (entryId: unknown, binding: TaskBindingReceipt) =>
  digest({ kind: "task-refresh", entryId, taskId: binding.taskId, revision: binding.revision }).slice(7);
const switchId = (entryId: unknown) => digest({ kind: "task-switch", entryId }).slice(7);

/** A refresh permits new context for the current task; it cannot rewrite the original entry. */
export function currentTaskRefresh(workspace: string, entry: ReturnType<typeof readPromptEntry>, binding: TaskBindingReceipt) {
  try {
    const id = refreshId(entry.entryId, binding);
    const receipt = read(join(contextStateRoot(workspace), "context-observations"), `${id}.json`);
    const target = object(receipt.binding);
    if (receipt.version !== 1 || receipt.kind !== "task-refresh" || receipt.entryId !== entry.entryId ||
        receipt.entryDigest !== digest(entry) || receipt.session !== entry.session || receipt.worktreeLocator !== entry.worktreeLocator ||
        target.taskId !== binding.taskId || target.revision !== binding.revision || binding.source !== "session" || binding.status !== "bound") return null;
    return { id, binding, originalBinding: promptEntryTaskBinding(workspace, entry) };
  } catch { return null; }
}

/** The continuity command owns the bind. Append a link without changing the original prompt or spend. */
export function associatePromptTask(observed: TaskBindingObservation) {
  const { workspace, session } = observed;
  const unavailable = (reason: string) => ({ status: "not-linked", reason });
  try {
    const resolved = resolveTaskContext(workspace, { session }), binding = taskBindingReceipt(resolved);
    if (binding.source !== "session" || binding.taskId !== observed.taskId || binding.revision !== observed.revision ||
        binding.attemptId !== observed.attemptId) return unavailable("current-binding-mismatch");
    const selected = latestSessionPrompt(workspace, session);
    if (!selected.entry) return unavailable(selected.reason);
    const entry = selected.entry, entryId = String(entry.entryId), existing = promptEntryTaskBinding(workspace, entry);
    if (!Number.isFinite(Date.parse(observed.requestedAt)) || Date.parse(String(entry.submittedAt)) > Date.parse(observed.requestedAt))
      return unavailable("entry-after-binding-request");
    if (existing) {
      if (existing.taskId === binding.taskId && existing.revision === binding.revision &&
          !lstatSync(join(contextStateRoot(workspace), "context-observations", `${switchId(entryId)}.json`), { throwIfNoEntry: false }))
        return { status: "linked", entryId, replay: true };
      if (digest(taskBindingReceipt(resolveTaskContext(workspace, { session }))) !== digest(binding)) return unavailable("current-binding-changed");
      const directory = join(contextStateRoot(workspace), "context-observations");
      // A mixed-task turn cannot truthfully allocate all native response tokens to either task.
      if (existing.taskId !== binding.taskId) publishContextObservation(join(directory, `${switchId(entryId)}.json`),
        { version: 1, ...observationGenerations(entry), kind: "task-switch", entryId, entryDigest: digest(entry), createdAt: new Date().toISOString() }, workspace);
      const id = refreshId(entryId, binding);
      const recorded = publishContextObservation(join(directory, `${id}.json`), { version: 1, ...observationGenerations(entry), kind: "task-refresh", entryId,
        entryDigest: digest(entry), session, worktreeLocator: entry.worktreeLocator, binding, previousBinding: existing,
        requestedAt: observed.requestedAt, createdAt: new Date().toISOString(), provenance: "explicit-continuity-bind" }, workspace);
      if (!currentTaskRefresh(workspace, entry, binding)) return unavailable("entry-association-conflict");
      return { status: "refresh-required", entryId, transitionId: id, replay: !recorded,
        next: "Use context-route --task <current request>. It refreshes this entry for the current task and retains the shared allowance." };
    }
    if (entry.provider !== "codex" || entry.scopeKind !== "provisional-session" || object(entry.binding).taskId !== null)
      return unavailable("entry-not-provisional");
    const id = digest({ kind: "task-binding", entryId }).slice(7);
    const path = join(contextStateRoot(workspace), "context-observations", `${id}.json`);
    // Recheck the recorded attempt immediately before publication; the association grants no authority.
    if (digest(taskBindingReceipt(resolveTaskContext(workspace, { session }))) !== digest(binding)) return unavailable("current-binding-changed");
    const recorded = publishContextObservation(path, { version: 1, ...observationGenerations(entry), kind: "task-binding", entryId, entryDigest: digest(entry),
      session, worktreeLocator: entry.worktreeLocator, binding, requestedAt: observed.requestedAt,
      createdAt: new Date().toISOString(), provenance: "explicit-continuity-bind" }, workspace);
    const winner = promptEntryTaskBinding(workspace, entry);
    if (!winner || winner.taskId !== binding.taskId || winner.revision !== binding.revision) return unavailable("entry-association-conflict");
    return { status: "linked", entryId, replay: !recorded };
  } catch { return unavailable("entry-association-unavailable"); }
}

/** New provider packets may cite the current session's entry; old job requests remain immutable. */
export function currentTaskPromptEntry(workspace: string, context: DecisionTaskContext) {
  try {
  const session = sessionId();
  if (!session) return null;
  const resolved = resolveTaskContext(workspace, { session });
  if (resolved.context?.taskId !== context.taskId || resolved.context.revision !== context.revision) return null;
  const selected = latestSessionPrompt(workspace, session), entry = selected.entry;
  if (!entry) return null;
  const binding = promptEntryTaskBinding(workspace, entry), current = taskBindingReceipt(resolved);
  const refreshed = currentTaskRefresh(workspace, entry, current);
  // The refresh belongs to B; the immutable prompt and whole-turn usage still belong to A.
  if (refreshed) return { entryId: String(entry.entryId), entryDigest: digest(entry), bindingSource: "explicit-task-refresh",
    transitionId: refreshed.id, originalBinding: binding };
  return binding?.taskId === context.taskId && binding.revision === context.revision
    ? { entryId: String(entry.entryId), entryDigest: digest(entry), bindingSource: entry.scopeKind === "bound-task" ? "prompt-entry" : "explicit-continuity-bind" } : null;
  } catch { return null; }
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("Invalid native token counter");
  return Number(value);
}

/** Versioned native-format adapter: only response usage is incremental; cumulative fields are ignored. */
export function codexUsageRecord(raw: unknown, session: string, turn: string) {
  if (!raw || typeof raw !== "object" || (raw as Record<string, unknown>).type !== "token_usage_record") return null;
  const payload = object((raw as Record<string, unknown>).payload);
  if (payload.thread_id !== session || (payload.root_turn_id ?? payload.turn_id) !== turn) return null;
  if (typeof payload.response_id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/u.test(payload.response_id)) throw new Error("Native response identity unavailable");
  const usage = object(payload.usage);
  const input = numeric(usage.input_tokens), output = numeric(usage.output_tokens), cached = numeric(usage.cached_input_tokens),
    reasoning = numeric(usage.reasoning_output_tokens), cacheWrite = numeric(usage.cache_write_input_tokens);
  if ((cached !== null && (input === null || cached > input)) || (reasoning !== null && (output === null || reasoning > output))) throw new Error("Invalid native token subset");
  return { responseId: payload.response_id, inputTokens: input, outputTokens: output, cachedInputTokens: cached, reasoningTokens: reasoning,
    cacheWriteInputTokens: cacheWrite, source: "codex-token-usage-v1", session, turn };
}

interface DeferredUsageRange {
  turn: string; file: string; offset: number; bytes: number; observedSize: number; digest: string;
}
interface UsageCursor {
  version: 1; session: string; pathDigest: string; file: string; offset: number; observedSize: number;
  boundaryBytes: number; boundaryDigest: string;
  deferred?: DeferredUsageRange[]; deferredOmittedRanges?: number;
}
const HOST_USAGE_WINDOW_BYTES = 8 * 1024 * 1024, CURSOR_BOUNDARY_BYTES = 4096;
const bytesDigest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const cursorPath = (workspace: string, session: string, transcript: string) => join(contextStateRoot(workspace), "native-usage-cursors", `${digest({ session, pathDigest: digest(transcript) }).slice(7)}.json`);
function readUsageCursor(workspace: string, session: string, transcript: string) {
  try {
    const path = cursorPath(workspace, session, transcript), raw = object(JSON.parse(narrativeFile(dirname(path), basename(path), HOST_USAGE_WINDOW_BYTES)));
    if (raw.version !== 1 || raw.session !== session || raw.pathDigest !== digest(transcript) || !/^\d+:\d+$/u.test(String(raw.file)) ||
        !Number.isSafeInteger(raw.offset) || Number(raw.offset) < 0 || !Number.isSafeInteger(raw.observedSize) || Number(raw.observedSize) < Number(raw.offset) ||
        raw.boundaryBytes !== Math.min(Number(raw.offset), CURSOR_BOUNDARY_BYTES) || !/^sha256:[a-f0-9]{64}$/u.test(String(raw.boundaryDigest)) ||
        raw.deferred !== undefined && (!Array.isArray(raw.deferred) || !raw.deferred.every(validDeferredRange)) ||
        raw.deferredOmittedRanges !== undefined && (!Number.isSafeInteger(raw.deferredOmittedRanges) || Number(raw.deferredOmittedRanges) < 0)) throw new Error("Invalid native usage cursor");
    return { cursor: raw as unknown as UsageCursor, reason: "retained" };
  } catch (error) { return { cursor: undefined, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "initial" : "cursor-invalid" }; }
}
function validDeferredRange(value: unknown): value is DeferredUsageRange {
  const range = object(value);
  return typeof range.turn === "string" && range.turn.length > 0 && range.turn.length <= 256 && !/[\x00-\x1f]/u.test(range.turn) &&
    /^\d+:\d+$/u.test(String(range.file)) && Number.isSafeInteger(range.offset) && Number(range.offset) >= 0 &&
    Number.isSafeInteger(range.bytes) && Number(range.bytes) > 0 && Number(range.bytes) <= HOST_USAGE_WINDOW_BYTES &&
    Number.isSafeInteger(range.observedSize) && Number(range.observedSize) >= Number(range.offset) + Number(range.bytes) &&
    /^sha256:[a-f0-9]{64}$/u.test(String(range.digest));
}
function usageLines(buffer: Buffer, offset: number, first: number, end: number) {
  const records: unknown[] = [], recordRanges: Array<DeferredUsageRange & { session: string }> = [];
  let unreadableUsageLines = 0;
  for (let start = first; start < end;) {
    const next = buffer.indexOf(10, start) + 1;
    if (!next || next > end) break;
    const line = buffer.subarray(start, next), text = line.toString("utf8");
    if (text.includes('"token_usage_record"')) {
      if (text.length > 65537) unreadableUsageLines++;
      else try {
        const raw = JSON.parse(text);
        if (raw.type === "token_usage_record") {
          records.push(raw);
          const payload = object(raw.payload), turn = payload.root_turn_id ?? payload.turn_id;
          if (typeof payload.thread_id === "string" && typeof turn === "string") {
            const prior = recordRanges.at(-1), absolute = offset + start;
            if (prior && prior.session === payload.thread_id && prior.turn === turn && prior.offset + prior.bytes === absolute) {
              prior.bytes += line.length;
            } else recordRanges.push({ session: payload.thread_id, turn, file: "", offset: absolute, bytes: line.length, observedSize: 0, digest: "" });
          }
        }
      } catch { unreadableUsageLines++; }
    }
    start = next;
  }
  return { records, recordRanges: recordRanges.map(range => ({ ...range,
    digest: bytesDigest(buffer.subarray(range.offset - offset, range.offset - offset + range.bytes)) })), unreadableUsageLines };
}
function readBytes(fd: number, offset: number, length: number) {
  const buffer = Buffer.alloc(length); let bytes = 0;
  while (bytes < length) { const count = readSync(fd, buffer, bytes, length - bytes, offset + bytes); if (!count) break; bytes += count; }
  return buffer.subarray(0, bytes);
}
function verifyUsageBoundary(path: string, checkpoint: Omit<UsageCursor, "version" | "session">) {
  if (realpathSync(path) !== path) return false;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    return stat.isFile() && `${stat.dev}:${stat.ino}` === checkpoint.file && stat.size >= checkpoint.observedSize &&
      bytesDigest(readBytes(fd, checkpoint.offset - checkpoint.boundaryBytes, checkpoint.boundaryBytes)) === checkpoint.boundaryDigest;
  } finally { closeSync(fd); }
}

/** Bounded snapshot or verified append delta. The cursor is only a rebuildable read hint. */
export function readHostUsageWindow(path: string, cursor?: UsageCursor, cursorReason = "snapshot") {
  if (!isAbsolute(path) || realpathSync(path) !== path || !lstatSync(path).isFile()) throw new Error("Native transcript must be a canonical ordinary file");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd), file = `${stat.dev}:${stat.ino}`;
    if (!stat.isFile()) throw new Error("Native transcript must remain an ordinary file");
    let reason = cursorReason, incremental = false;
    if (cursor) {
      if (cursor.pathDigest !== digest(path)) reason = "cursor-path-changed";
      else if (cursor.file !== file) reason = "file-replaced";
      else if (stat.size < cursor.observedSize || stat.size < cursor.offset) reason = "file-truncated";
      else if (bytesDigest(readBytes(fd, cursor.offset - cursor.boundaryBytes, cursor.boundaryBytes)) !== cursor.boundaryDigest) reason = "boundary-rewritten";
      else { incremental = true; reason = "append-delta"; }
    }
    const requestedOffset = incremental ? cursor!.offset : 0;
    const offset = Math.max(requestedOffset, stat.size - HOST_USAGE_WINDOW_BYTES), length = stat.size - offset;
    const buffer = readBytes(fd, offset, length), bytes = buffer.length;
    if (bytes !== length) throw new Error("Native transcript changed during capture");
    const first = offset > requestedOffset ? buffer.indexOf(10) + 1 : 0;
    const last = buffer.lastIndexOf(10), completeOffset = last >= first ? offset + last + 1 : requestedOffset;
    const parsed = usageLines(buffer, offset, first, last >= first ? last + 1 : 0);
    const boundaryBytes = Math.min(completeOffset, CURSOR_BOUNDARY_BYTES), boundary = readBytes(fd, completeOffset - boundaryBytes, boundaryBytes);
    const after = fstatSync(fd);
    if (boundary.length !== boundaryBytes || after.size < stat.size || after.mtimeMs !== stat.mtimeMs && after.size === stat.size)
      throw new Error("Native transcript changed during capture");
    return { ...parsed, recordRanges: parsed.recordRanges.map(range => ({ ...range, file, observedSize: stat.size })),
      truncated: offset > requestedOffset, readBytes: bytes,
      source: { pathDigest: digest(path), file, offset, bytes, completeOffset, observedSize: stat.size,
        windowDigest: bytesDigest(buffer) },
      collectionWindow: { mode: incremental ? "incremental" : cursor || cursorReason === "cursor-invalid" ? "reset" : "snapshot", reason,
        completeOffset, pendingBytes: stat.size - completeOffset, omittedBytes: offset - requestedOffset },
      checkpoint: { file, pathDigest: digest(path), offset: completeOffset, observedSize: stat.size, boundaryBytes, boundaryDigest: bytesDigest(boundary) } };
  } finally { closeSync(fd); }
}

type HostUsageCapture = Pick<ReturnType<typeof readHostUsageWindow>, "records" | "truncated" | "readBytes" | "source" | "collectionWindow"> & {
  responseSources?: ReadonlyMap<string, ReturnType<typeof readHostUsageWindow>["source"]>;
};
export function importContextUsage(workspace: string, entryId: string, transcript: string, captured?: HostUsageCapture) {
  const entry = readPromptEntry(workspace, entryId), window: HostUsageCapture = captured ?? readHostUsageWindow(transcript);
  // Native response usage is scoped to a turn, not to an individual steered input. Never
  // choose one entry or revise earlier immutable receipts when that turn has multiple inputs.
  const attribution = promptTurnAttribution(workspace, String(entry.session), String(entry.turn));
  if (attribution !== "unique") return { version: 1, entryId, recorded: 0, duplicates: 0, invalid: 0, storeProjectionFailures: 0,
    storeProjection: attribution, truncated: window.truncated, readBytes: window.readBytes, collectionWindow: window.collectionWindow,
    coverage: "Native turn usage cannot be assigned to one exact prompt; attribution remains unknown.", confirmedModelUse: null, avoidedTokens: null };
  const familyId = promptAccountingFamily(workspace, entry).familyId;
  const taskBinding = promptEntryTaskBinding(workspace, entry);
  let recorded = 0, duplicates = 0, invalid = 0, storeProjectionFailures = 0, store: Store | undefined;
  const directory = join(contextStateRoot(workspace), "context-observations");
  const switched = lstatSync(join(directory, `${switchId(entryId)}.json`), { throwIfNoEntry: false });
  try {
    // Never create an operational database merely to collect analytics.
    if (taskBinding && !switched) try {
      const path = defaultDbPath(workspace);
      if (lstatSync(path, { throwIfNoEntry: false })?.isFile()) {
        const probe = new Store(path, { readOnly: true, busyTimeoutMs: 100 }); probe.close();
        store = new Store(path, { busyTimeoutMs: 100 });
      }
    } catch { /* Receipt evidence remains available; no schema migration or database creation. */ }
    const selected = new Map<string, NonNullable<ReturnType<typeof codexUsageRecord>> | null>();
    // Validate a whole window before publication; choosing the first conflicting counter hides corruption.
    for (const raw of window.records) try {
      const usage = codexUsageRecord(raw, String(entry.session), String(entry.turn));
      if (!usage) continue;
      const id = digest({ kind: "usage", provider: "codex", session: usage.session, responseId: usage.responseId }).slice(7);
      if (!selected.has(id)) selected.set(id, usage);
      else if (selected.get(id) && digest(selected.get(id)) === digest(usage)) duplicates++;
      else if (selected.get(id)) { selected.set(id, null); invalid++; }
    } catch { invalid++; }
    const projectUsage = (id: string, usage: NonNullable<ReturnType<typeof codexUsageRecord>>) => {
      if (store && typeof taskBinding?.taskId === "string" && store.readTask(taskBinding.taskId)) {
        if (!store.hasUsageMeasurement(usage.source, id) && !store.recordUsage({ taskId: taskBinding.taskId, actionId: null, kind: "provider", inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens, reasoningTokens: usage.reasoningTokens,
          durationMs: null, costMicros: null, source: usage.source, measurementId: id })) storeProjectionFailures++;
      }
    };
    for (const [id, usage] of selected) {
      if (!usage) continue;
      try {
        const path = join(directory, `${id}.json`), existing = lstatSync(path, { throwIfNoEntry: false });
        if (existing) {
          const prior = read(directory, `${id}.json`);
          if (prior.entryId !== entryId || digest(prior.usage) !== digest(usage)) throw new Error("Native usage attribution conflict");
          projectUsage(id, usage);
          duplicates++; continue;
        }
        const capturedAt = new Date().toISOString();
        if (!publishContextObservation(path, { version: 1, ...observationGenerations(entry), kind: "usage", entryId, createdAt: capturedAt, usage,
          source: window.responseSources?.get(usage.responseId) ?? window.source })) {
          const prior = read(directory, `${id}.json`);
          if (prior.entryId !== entryId || digest(prior.usage) !== digest(usage)) throw new Error("Native usage attribution conflict");
          projectUsage(id, usage);
          duplicates++; continue;
        }
        projectContextMetric(contextStateRoot(workspace), { id, workspace: String(entry.workspace), capturedAt,
          kind: "usage", entryId, familyId, routeId: typeof entry.routeReceiptId === "string" ? entry.routeReceiptId : null,
          taskId: !switched ? taskBinding?.taskId ?? null : null, taskRevision: !switched ? taskBinding?.revision ?? null : null,
          status: "observed", reason: null, counts: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens, reasoningTokens: usage.reasoningTokens } });
        recorded++;
        projectUsage(id, usage);
      } catch { invalid++; }
    }
  } finally { store?.close(); }
  return { version: 1, entryId, recorded, duplicates, invalid, storeProjectionFailures,
    storeProjection: store ? "idempotent-write-attempted" : switched ? "unallocated-multiple-tasks" : "unavailable-or-unbound", truncated: window.truncated, readBytes: window.readBytes,
    collectionWindow: window.collectionWindow,
    coverage: "matching native response records in a bounded window; missing responses remain unknown", confirmedModelUse: null, avoidedTokens: null };
}

function sessionEntries(workspace: string, session: string, turns: Set<string>) {
  const directory = join(contextStateRoot(workspace), "prompt-session-index", digest(session).slice(7)), turnPrefixes = new Set([...turns].map(turn => digest(turn).slice(7)));
  let inventory: string[];
  try { inventory = readdirSync(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; inventory = []; }
  const matching = inventory.flatMap(name => { const value = entryIndexName(name); return value && turnPrefixes.has(value.turn) ? [value] : []; });
  const names = [...new Map(matching.map(value => [value.entryId, value])).values()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || a.entryId.localeCompare(b.entryId));
  const entries = names.slice(0, 128).flatMap(name => {
    try { const entry = readPromptEntry(workspace, name.entryId); return entry.session === session && turns.has(String(entry.turn)) ? [entry] : []; }
    catch { return []; }
  });
  return { names, entries, indexedTurns: new Set(matching.map(value => value.turn)) };
}

function promptTurnAttribution(workspace: string, session: string, turn: string) {
  const indexed = sessionEntries(workspace, session, new Set([turn])), ids = new Set(indexed.names.map(row => row.entryId));
  const directory = join(contextStateRoot(workspace), "prompt-preparations", digest(session).slice(7));
  let handle: ReturnType<typeof opendirSync> | undefined;
  try {
    handle = opendirSync(directory); const started = Date.now(); let count = 0;
    for (let file = handle.readSync(); file; file = handle.readSync()) {
      if (++count > 10000 || Date.now() - started > 1000) return "unallocated-prompt-inventory-incomplete";
      if (!/^(?:[a-f0-9]{64}-)?[a-f0-9]{64}\.json$/u.test(file.name)) continue;
      const marker = object(JSON.parse(narrativeFile(directory, file.name, 4096)));
      if (marker.session === session && marker.turn === turn && ID.test(String(marker.entryId))) ids.add(String(marker.entryId));
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return "unallocated-prompt-inventory-unavailable"; }
  finally { handle?.closeSync(); }
  return ids.size > 1 ? "unallocated-multiple-prompts" : indexed.names.length !== indexed.entries.length ? "unallocated-prompt-inventory-unavailable" : "unique";
}

/** A host-supplied transcript links turns on session end; never on the prompt's critical path. */
export function collectContextHostUsage(workspace: string, session: string, transcript: string,
  options: { turn?: string; captured?: ReturnType<typeof readHostUsageWindow>; excludedTurns?: Set<string> } = {}) {
  try {
    const started = Date.now(), captured = options.captured ?? readHostUsageWindow(transcript);
    const excluded = (raw: unknown) => { const payload = object(object(raw).payload); return payload.thread_id === session &&
      (options.turn === undefined || (payload.root_turn_id ?? payload.turn_id) === options.turn) && options.excludedTurns?.has(String(payload.root_turn_id ?? payload.turn_id)) === true; };
    const skipped = captured.records.filter(excluded), skippedOriginals = captured.recordRanges.filter(range => range.session === session &&
      (options.turn === undefined || range.turn === options.turn) && options.excludedTurns?.has(range.turn))
      .map(({ session: _session, ...range }) => range).filter(validDeferredRange);
    const skippedCoverage = { skippedResponses: skipped.length, skippedTurns: new Set(skippedOriginals.map(range => range.turn)).size, skippedOriginals, skippedUsage: "unknown" };
    const window = skipped.length ? { ...captured, records: captured.records.filter(raw => !excluded(raw)) } : captured;
    if (!window.records.length) return { state: skipped.length ? "skipped-usage-records" : !window.readBytes ? "no-new-records" :
      window.collectionWindow.mode === "incremental" && window.unreadableUsageLines === 0 ? "no-new-usage-records" : "format-unrecognized", entries: 0, recorded: 0, invalid: 0,
      unlinkedTurns: 0, unlinkedOriginals: [] as DeferredUsageRange[], ...skippedCoverage, missingUsage: "unknown", cursorSafe: window.unreadableUsageLines === 0 };
    const turns = new Set(window.records.flatMap(raw => {
      const payload = object(object(raw).payload);
      const turn = String(payload.root_turn_id ?? payload.turn_id);
      return payload.thread_id === session && (options.turn === undefined || turn === options.turn) ? [turn] : [];
    }));
    const { names, entries, indexedTurns } = sessionEntries(workspace, session, turns);
    const unlinked = new Set([...turns].filter(turn => !indexedTurns.has(digest(turn).slice(7))));
    const unlinkedOriginals = window.recordRanges.filter(range => range.session === session && unlinked.has(range.turn))
      .map(({ session: _session, ...range }) => range).filter(validDeferredRange);
    const ambiguousTurns = new Set(entries.filter(entry => entries.filter(other => other.turn === entry.turn).length > 1).map(entry => String(entry.turn)));
    const eligible = entries.filter(entry => !ambiguousTurns.has(String(entry.turn))), unique = eligible.slice(0, 32);
    const results = [];
    for (const entry of unique) {
      if (Date.now() - started > 1000) break;
      const result = importContextUsage(workspace, String(entry.entryId), transcript, window); results.push(result);
      if (result.storeProjection === "unallocated-multiple-prompts") ambiguousTurns.add(String(entry.turn));
    }
    // Multiple exact inputs permanently share one host token turn. Preserve unknown originals,
    // but do not pin the session's append cursor or choose one input as the token owner.
    const ambiguousOriginals = window.recordRanges.filter(range => range.session === session && ambiguousTurns.has(range.turn))
      .map(({ session: _session, ...range }) => ({ ...range, reason: "unallocated-multiple-prompts" }));
    return { state: results.length ? "observed" : "no-linked-entries", entries: results.length, recorded: results.reduce((sum, value) => sum + value.recorded, 0),
      invalid: results.reduce((sum, value) => sum + value.invalid, 0), ambiguous: entries.filter(entry => ambiguousTurns.has(String(entry.turn))).length,
      ambiguousTurns: ambiguousTurns.size, ambiguousOriginals, ambiguousUsage: "unknown",
      unlinkedTurns: unlinked.size, unlinkedOriginals, ...skippedCoverage,
      cursorSafe: names.length === entries.length && eligible.length === unique.length && results.length === unique.length &&
        turns.size === unlinked.size + new Set([...ambiguousTurns, ...unique.map(entry => String(entry.turn))]).size &&
        window.unreadableUsageLines === 0 && results.every(value => value.invalid === 0 && value.storeProjectionFailures === 0 &&
          !["unallocated-prompt-inventory-incomplete", "unallocated-prompt-inventory-unavailable"].includes(value.storeProjection)),
      truncated: names.length > 128 || window.truncated || eligible.length > unique.length || results.length < unique.length, missingUsage: "unknown" };
  } catch { return { state: "unavailable", reason: "native-transcript-or-entry-unavailable", missingUsage: "unknown" }; }
}

function readDeferredUsageRange(path: string, range: DeferredUsageRange) {
  if (!isAbsolute(path) || realpathSync(path) !== path) throw new Error("deferred-original-path-changed");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let readBytesCount = 0;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || `${stat.dev}:${stat.ino}` !== range.file) throw new Error("deferred-original-file-replaced");
    if (stat.size < range.observedSize) throw new Error("deferred-original-truncated");
    const buffer = readBytes(fd, range.offset, range.bytes); readBytesCount += buffer.length;
    if (buffer.length !== range.bytes || bytesDigest(buffer) !== range.digest) throw new Error("deferred-original-digest-changed");
    const parsed = usageLines(buffer, range.offset, 0, buffer.length), end = range.offset + range.bytes;
    if (!parsed.records.length || parsed.unreadableUsageLines || buffer.at(-1) !== 10) throw new Error("deferred-original-format-unavailable");
    return { ...parsed, truncated: false, readBytes: buffer.length,
      source: { pathDigest: digest(path), file: range.file, offset: range.offset, bytes: range.bytes, completeOffset: end,
        observedSize: range.observedSize, windowDigest: range.digest },
      collectionWindow: { mode: "deferred", reason: "late-exact-entry", completeOffset: end, pendingBytes: 0, omittedBytes: 0 } };
  } catch (error) { throw Object.assign(error as object, { readBytes: readBytesCount }); }
  finally { closeSync(fd); }
}
function replayDeferredUsage(workspace: string, session: string, transcript: string, ranges: DeferredUsageRange[], allowance: number) {
  const started = Date.now(), { names, entries } = sessionEntries(workspace, session, new Set(ranges.map(range => range.turn)));
  const pending: DeferredUsageRange[] = [], recovered: DeferredUsageRange[] = [], unavailable: Array<DeferredUsageRange & { reason: string }> = [];
  let recorded = 0, readBytes = 0, imports = 0;
  const groups = new Map<string, DeferredUsageRange[]>();
  for (const range of ranges) {
    let group = groups.get(range.turn);
    if (!group) { group = []; groups.set(range.turn, group); }
    group.push(range);
  }
  for (const [turn, group] of groups) {
    const linked = entries.filter(entry => entry.turn === turn), bytes = group.reduce((sum, range) => sum + range.bytes, 0);
    if (names.length === entries.length && linked.length > 1) {
      unavailable.push(...group.map(range => ({ ...range, reason: "unallocated-multiple-prompts" }))); continue;
    }
    if (linked.length !== 1) { pending.push(...group); continue; }
    if (bytes > HOST_USAGE_WINDOW_BYTES) { unavailable.push(...group.map(range => ({ ...range, reason: "deferred-turn-over-window" }))); continue; }
    if (imports >= 32 || Date.now() - started > 1000 || readBytes + bytes > allowance) { pending.push(...group); continue; }
    try {
      const windows = group.map(range => { const window = readDeferredUsageRange(transcript, range); readBytes += window.readBytes; return window; }); imports++;
      const responseSources = new Map<string, ReturnType<typeof readHostUsageWindow>["source"]>();
      for (const window of windows) for (const raw of window.records) {
        const payload = object(object(raw).payload);
        if (typeof payload.response_id === "string" && !responseSources.has(payload.response_id)) responseSources.set(payload.response_id, window.source);
      }
      // Validate all retained ranges for a turn together: conflicting delayed counters cannot choose the first original.
      const imported = importContextUsage(workspace, String(linked[0]!.entryId), transcript,
        { ...windows[0]!, records: windows.flatMap(window => window.records), readBytes: bytes, responseSources });
      recorded += imported.recorded;
      if (imported.storeProjection === "unallocated-multiple-prompts") {
        unavailable.push(...group.map(range => ({ ...range, reason: "unallocated-multiple-prompts" }))); continue;
      }
      if (["unallocated-prompt-inventory-incomplete", "unallocated-prompt-inventory-unavailable"].includes(imported.storeProjection)) { pending.push(...group); continue; }
      if (imported.invalid || imported.storeProjectionFailures) { pending.push(...group); continue; }
      recovered.push(...group);
    } catch (error) {
      readBytes += Number((error as { readBytes?: number }).readBytes ?? 0);
      unavailable.push(...group.map(range => ({ ...range, reason: error instanceof Error && error.message.startsWith("deferred-original-") ? error.message : "deferred-original-unavailable" })));
    }
  }
  return { pending, recovered, unavailable, recorded, readBytes };
}

/** A cursor is an advisory pointer. Preserve a concurrently changed hint instead of overwriting its unknown ranges. */
export function publishUsageCursor(workspace: string, session: string, transcript: string, expected: UsageCursor | undefined,
  checkpoint: ReturnType<typeof readHostUsageWindow>["checkpoint"], deferred: DeferredUsageRange[], omitted: number) {
  if (!verifyUsageBoundary(transcript, checkpoint)) return { state: "not-advanced", reason: "source-changed-before-cursor" };
  const current = readUsageCursor(workspace, session, transcript).cursor;
  if (digest(current ?? null) !== digest(expected ?? null)) return { state: "retained", reason: "concurrent-cursor-already-recorded" };
  durableJson(cursorPath(workspace, session, transcript), { version: 1, session, ...checkpoint, deferred,
    deferredOmittedRanges: omitted, collectorGeneration: runtimeExecutionIdentity() });
  return { state: "advanced", reason: "originals-recorded" };
}
function boundedDeferredRanges(ranges: DeferredUsageRange[]) {
  const unique = [...new Map(ranges.map(range => [digest({ turn: range.turn, file: range.file, offset: range.offset, bytes: range.bytes, digest: range.digest }), range])).values()];
  const retained: DeferredUsageRange[] = []; let bytes = 2048, omitted = 0;
  // Reuse the native window's read allowance; evicted hints remain explicit unknown coverage in their immutable collection originals.
  for (const range of unique.reverse()) {
    const length = Buffer.byteLength(JSON.stringify(range)) + 1;
    if (bytes + length > HOST_USAGE_WINDOW_BYTES) omitted++; else { retained.push(range); bytes += length; }
  }
  return { ranges: retained.reverse(), omitted };
}

/** A neutral end-of-turn observation cannot reserve, release, accept or continue developer work. */
export function observeContextHostUsage(workspace: string, event: Record<string, unknown>) {
  const session = event.session_id, turn = event.turn_id;
  if (typeof session !== "string" || !session.trim() || session.length > 128 || /[\x00-\x1f]/u.test(session) ||
      typeof turn !== "string" || !turn.trim() || turn.length > 256 || /[\x00-\x1f]/u.test(turn))
    return { state: "missing-native-identity", missingUsage: "unknown", readBytes: null, collectionWindow: null,
      cursor: { state: "not-advanced", reason: "missing-native-identity" } };
  let window: ReturnType<typeof readHostUsageWindow> | undefined;
  let expectedCursor: UsageCursor | undefined;
  let result: ReturnType<typeof collectContextHostUsage>;
  let replay: ReturnType<typeof replayDeferredUsage> = { pending: [], recovered: [], unavailable: [], recorded: 0, readBytes: 0 };
  let deferred = { ranges: [] as DeferredUsageRange[], omitted: 0 }, previousOmitted = 0;
  try {
    if (typeof event.transcript_path !== "string") throw new Error("missing-transcript");
    const retained = readUsageCursor(workspace, session, event.transcript_path);
    expectedCursor = retained.cursor;
    window = readHostUsageWindow(event.transcript_path, retained.cursor, retained.reason);
    previousOmitted = retained.cursor?.deferredOmittedRanges ?? 0;
    replay = replayDeferredUsage(workspace, session, event.transcript_path, retained.cursor?.deferred ?? [], HOST_USAGE_WINDOW_BYTES - window.readBytes);
    // A rewritten snapshot cannot attribute bytes whose earlier exact deferred original has just failed integrity.
    const excludedTurns = new Set(replay.unavailable.map(range => range.turn));
    // One cursor covers the session delta, including late records for earlier exactly linked turns.
    result = collectContextHostUsage(workspace, session, event.transcript_path, { captured: window, excludedTurns });
    deferred = boundedDeferredRanges([...replay.pending, ...("unlinkedOriginals" in result ? result.unlinkedOriginals : [])]);
  } catch { result = { state: "unavailable", reason: "native-transcript-or-entry-unavailable", missingUsage: "unknown" }; }
  const deferredCoverage = { retainedRanges: deferred.ranges.length, recoveredRanges: replay.recovered.length, unavailableRanges: replay.unavailable.length,
    omittedRanges: previousOmitted + deferred.omitted, readBytes: replay.readBytes, unavailableOriginals: replay.unavailable,
    skippedCurrentResponses: "skippedResponses" in result ? result.skippedResponses : null,
    skippedCurrentTurns: "skippedTurns" in result ? result.skippedTurns : null,
    skippedCurrentOriginals: "skippedOriginals" in result ? result.skippedOriginals : [],
    missingUsage: "unknown", attribution: "exact later indexed entry only" };
  const collection = { ...result, ...("recorded" in result && typeof result.recorded === "number" ? { recorded: result.recorded + replay.recorded } : {}),
    state: replay.recorded ? "observed" : result.state };
  const id = digest({ kind: "usage-collection", session, turn, source: window?.source ?? null, state: collection.state,
    recovered: replay.recovered, unavailable: replay.unavailable }).slice(7);
  let cursor = { state: "not-advanced", reason: "incomplete-collection" };
  try {
    publishContextObservation(join(contextStateRoot(workspace), "context-observations", `${id}.json`), {
      version: 1, ...observationGenerations(), kind: "usage-collection", workspace: realpathSync(workspace), session, turn, createdAt: new Date().toISOString(),
      status: collection.state, reason: collection.state === "observed" ? null : collection.state, collection, deferred: deferredCoverage,
      source: window?.source ?? null, collectionWindow: window?.collectionWindow ?? null,
      unreadableUsageLines: window?.unreadableUsageLines ?? null,
      acceptance: "unknown", originalReadCoverage: "unknown", provenance: "codex-stop-observer",
    });
    if (window && typeof event.transcript_path === "string" && "cursorSafe" in result && result.cursorSafe) {
      // Original response/collection receipts commit first. A crash only causes idempotent re-reading.
      cursor = publishUsageCursor(workspace, session, event.transcript_path, expectedCursor, window.checkpoint, deferred.ranges, deferredCoverage.omittedRanges);
    }
  } catch { cursor = { state: "not-advanced", reason: "cursor-or-observation-write-unavailable" }; }
  return { ...collection, deferred: deferredCoverage, readBytes: window ? window.readBytes + replay.readBytes : null,
    collectionWindow: window?.collectionWindow ?? null, cursor };
}

/** Explicit observations never rewrite the prepared entry or infer acceptance from a passing check. */
export function recordContextObservation(workspace: string, entryId: string, observation: { kind: "expansion"; path: string; sourceWorkspace?: string } | { kind: "outcome"; disposition: "accepted" | "reopened"; evidence: string }) {
  const entry = readPromptEntry(workspace, entryId);
  let source: { workspace: string; worktreeLocator: string; path: string; digest: string } | undefined;
  if (observation.kind === "expansion") safeSubjectPath(observation.path);
  else if (!["accepted", "reopened"].includes(observation.disposition) || !observation.evidence || observation.evidence.length > 512) throw new Error("Outcome requires an evidence reference");
  if (observation.kind === "expansion" && observation.sourceWorkspace !== undefined) {
    const root = realpathSync(observation.sourceWorkspace), context = workContext(root);
    if (context.worktree !== root || !localContextPath(observation.path)) throw new Error("External read requires a Git worktree root and an eligible relative source path");
    const captured = worktreeBytes(root, observation.path, 1024 * 1024);
    if (captured.type !== "regular") throw new Error("External source must be a regular file");
    source = { workspace: root, worktreeLocator: context.locator, path: observation.path,
      digest: `sha256:${createHash("sha256").update(captured.bytes).digest("hex")}` };
  }
  const recorded = { ...observation, ...(source ? { source } : {}) };
  const id = digest({ entryId, observation: recorded }).slice(7), path = join(contextStateRoot(workspace), "context-observations", `${id}.json`);
  const capturedAt = new Date().toISOString();
  const historical = promptEntryTaskBinding(workspace, entry);
  if (publishContextObservation(path, { version: 1, ...observationGenerations(entry), entryId, ...recorded, createdAt: capturedAt, provenance: "host-reported" }))
    projectContextMetric(contextStateRoot(workspace), { id, workspace: String(entry.workspace), capturedAt, kind: observation.kind,
      entryId, familyId: promptAccountingFamily(workspace, entry).familyId, routeId: typeof entry.routeReceiptId === "string" ? entry.routeReceiptId : null,
      taskId: historical?.taskId ?? null, taskRevision: historical?.revision ?? null, status: observation.kind === "outcome" ? observation.disposition : "observed",
      reason: null, counts: { accepted: observation.kind === "outcome" ? Number(observation.disposition === "accepted") : null,
        externalRead: observation.kind === "expansion" ? Number(Boolean(source && source.workspace !== realpathSync(workspace))) : null } });
  return { recorded: true, id };
}

export function contextObservationStatus(workspace: string) {
  const root = contextStateRoot(workspace), counts: Record<string, number> = Object.create(null), reasons: Record<string, number> = Object.create(null);
  const usage = { inputTokens: null as number | null, outputTokens: null as number | null, responses: 0 };
  const reads = { local: 0, external: 0, classification: "observed reads, not established retrieval misses" };
  const documentation = new DocumentationObservations();
  let truncated = false, invalid = 0, readBytes = 0;
  const projection = readContextProjection(root, workspace, { kinds: ["entry", "route", "usage", "outcome", "expansion", "failure", "observation"] });
  const labels = { entry: "prompt-entries", route: "routes", usage: "context-observations", outcome: "context-observations",
    expansion: "context-observations", failure: "entry-failures", decision: "decisions", observation: "context-observations" };
  const receipts = recentReceipts(root, ["prompt-entries", "entry-failures", "prompt-rejections", "context-observations", "routes"],
    { limit: 1000, maximumBytes: 8 * 1024 * 1024,
      prioritized: projection.records.map(item => ({ collection: item.kind === "failure" && item.status === "not-delivered" ? "prompt-rejections" : labels[item.kind], name: `${item.id}.json` })),
      predicate: item => item.workspace === undefined || item.workspace === realpathSync(workspace) });
  invalid += receipts.invalid; readBytes = receipts.readBytes; truncated = receipts.truncated;
  let latestEntry: Record<string, unknown> | null = null, latestRoute: Record<string, unknown> | null = null;
  for (const { collection, name, value: item } of receipts.records) try {
    const kind = String(item.kind ?? item.status ?? item.outcome ?? "unknown");
    if (!/^[a-z][a-z0-9-]{0,79}$/u.test(kind)) throw new Error("Invalid observation kind");
    const reference = { id: basename(name, ".json"), capturedAt: new Date(Date.parse(String(item.createdAt ?? item.capturedAt))).toISOString(),
      workspace: realpathSync(workspace), status: kind, entryId: ID.test(String(item.entryId)) ? item.entryId : null,
      routeId: typeof item.routeReceiptId === "string" && /^[a-f0-9-]{1,80}$/u.test(item.routeReceiptId) ? item.routeReceiptId : collection === "routes" ? basename(name, ".json") : null };
    if (collection === "prompt-entries" && !latestEntry) latestEntry = reference;
    if (collection === "routes" && !latestRoute) latestRoute = reference;
    if (collection === "prompt-entries" && item.workspace === realpathSync(workspace)) documentation.add(item);
    counts[`${collection}:${kind}`] = (counts[`${collection}:${kind}`] ?? 0) + 1;
    if (collection === "context-observations" && kind === "expansion") {
      const source = item.source as Record<string, unknown> | undefined;
      if (source?.workspace && source.workspace !== realpathSync(workspace)) reads.external++; else reads.local++;
    }
    const reason = item.reason ?? item.code ?? item.selectionReason;
    if (typeof reason === "string") reasons[reason] = (reasons[reason] ?? 0) + 1;
    if (collection === "context-observations" && kind === "usage") {
      const values = object(item.usage); usage.responses++;
      for (const key of ["inputTokens", "outputTokens"] as const) if (numeric(values[key]) !== null) usage[key] = (usage[key] ?? 0) + Number(values[key]);
    }
  } catch { invalid++; }
  return { version: 1, counts, reasons, usage, reads, documentation: documentation.result(truncated), truncated, scanComplete: receipts.scanComplete, invalid, readBytes,
    selection: receipts.selection, projection: { state: projection.state, role: "receipt-read-hints", truncated: projection.truncated,
      evictedRecords: projection.evictedRecords, evictedBytes: projection.evictedBytes, writeCoverage: projection.writeCoverage, limits: projection.limits }, latestEntry, latestRoute,
    confirmedModelUse: null, avoidedTokens: null, benefit: "requires comparable accepted tasks; counters are known subtotals" };
}
