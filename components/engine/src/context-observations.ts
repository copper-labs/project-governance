import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, linkSync, unlinkSync, opendirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { digest, durableJson, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { contextStateRoot } from "./context-command.ts";
import { safeSubjectPath } from "./change-subject.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, sessionId, workContext } from "../../harness/src/store/location.ts";
import type { TaskBindingObservation } from "../../harness/src/cli.ts";
import { resolveTaskContext, taskBindingReceipt, type TaskBindingReceipt } from "./decision-task-binding.ts";
import type { DecisionTaskContext } from "./decision-task-context.ts";
import { DocumentationObservations } from "./context-documentation.ts";

const ID = /^[a-f0-9]{64}$/u;
const read = (directory: string, name: string) => object(JSON.parse(narrativeFile(directory, name)));

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

export function publishContextObservation(path: string, value: unknown): boolean {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    durableJson(temporary, value);
    try { linkSync(temporary, path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
  } finally { try { unlinkSync(temporary); } catch { /* A failed write may not have created a file. */ } }
}

/** Read explicit entry identities; a current ambient task cannot retarget historical observations. */
export function readPromptEntry(workspace: string, id: string) {
  if (!ID.test(id)) throw new Error("Invalid prompt entry ID");
  const entry = read(join(contextStateRoot(workspace), "prompt-entries"), `${id}.json`);
  if (entry.version !== 1 || entry.entryId !== id || entry.workspace !== realpathSync(workspace) ||
      typeof entry.session !== "string" || typeof entry.turn !== "string") throw new Error("Prompt entry identity mismatch");
  return entry;
}

/** Inspect only this session; incomplete or ambiguous inventory cannot choose an older entry. */
export function latestSessionPrompt(workspace: string, session: string) {
  const directory = join(contextStateRoot(workspace), "prompt-preparations", digest(session).slice(7));
  let handle: ReturnType<typeof opendirSync> | undefined;
  try {
    handle = opendirSync(directory);
    const turns: Array<{ time: number; entryId: string; turn: string }> = [];
    const started = Date.now(); let count = 0;
    for (let file = handle.readSync(); file; file = handle.readSync()) {
      if (++count > 10000 || Date.now() - started > 1000) return { reason: "session-entry-scan-incomplete" };
      if (!/^[a-f0-9]{64}\.json$/u.test(file.name)) continue;
      if (lstatSync(join(directory, file.name)).size > 4096) return { reason: "session-entry-scan-incomplete" };
      const marker = read(directory, file.name), time = Date.parse(String(marker.submittedAt));
      if (marker.session !== session || !Number.isSafeInteger(time) || !ID.test(String(marker.entryId)) ||
          typeof marker.turn !== "string") return { reason: "session-entry-identity-unverified" };
      turns.push({ time, entryId: String(marker.entryId), turn: marker.turn });
    }
    turns.sort((a, b) => b.time - a.time);
    const newest = turns[0];
    if (!newest) return { reason: "session-entry-unavailable" };
    if (turns[1]?.time === newest.time) return { reason: "session-entry-ambiguous" };
    const path = join(contextStateRoot(workspace), "prompt-entries", `${newest.entryId}.json`);
    if (!lstatSync(path, { throwIfNoEntry: false })) return { reason: "session-entry-superseded" };
    if (lstatSync(path).size > 65536) return { reason: "session-entry-scan-incomplete" };
    const entry = readPromptEntry(workspace, newest.entryId);
    if (entry.session !== session || entry.turn !== newest.turn ||
        typeof entry.submittedAt !== "string" || Date.parse(entry.submittedAt) !== newest.time)
      return { reason: "session-entry-identity-unverified" };
    if (entry.worktreeLocator !== workContext(workspace).locator) return { reason: "entry-worktree-identity-changed" };
    return { entry, reason: "session-entry-found" };
  } catch { return { reason: "session-entry-unavailable" }; }
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
        { version: 1, kind: "task-switch", entryId, entryDigest: digest(entry), createdAt: new Date().toISOString() });
      const id = refreshId(entryId, binding);
      const recorded = publishContextObservation(join(directory, `${id}.json`), { version: 1, kind: "task-refresh", entryId,
        entryDigest: digest(entry), session, worktreeLocator: entry.worktreeLocator, binding, previousBinding: existing,
        requestedAt: observed.requestedAt, createdAt: new Date().toISOString(), provenance: "explicit-continuity-bind" });
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
    const recorded = publishContextObservation(path, { version: 1, kind: "task-binding", entryId, entryDigest: digest(entry),
      session, worktreeLocator: entry.worktreeLocator, binding, requestedAt: observed.requestedAt,
      createdAt: new Date().toISOString(), provenance: "explicit-continuity-bind" });
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
  const binding = promptEntryTaskBinding(workspace, entry);
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

/** Bounded snapshot of a growing host log. Raw prompts/tool results never leave this reader. */
export function readHostUsageWindow(path: string) {
  if (!isAbsolute(path) || realpathSync(path) !== path || !lstatSync(path).isFile()) throw new Error("Native transcript must be a canonical ordinary file");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd), length = Math.min(stat.size, 8 * 1024 * 1024), offset = stat.size - length;
    const buffer = Buffer.alloc(length); let bytes = 0;
    while (bytes < length) { const count = readSync(fd, buffer, bytes, length - bytes, offset + bytes); if (!count) break; bytes += count; }
    const lines = buffer.subarray(0, bytes).toString("utf8").split("\n");
    if (offset) lines.shift();
    if (lines.at(-1)) lines.pop(); // The host may still be appending the final JSON record.
    const records: unknown[] = [];
    for (const line of lines) {
      if (!line.includes('"token_usage_record"') || line.length > 65536) continue;
      try { const raw = JSON.parse(line); if (raw.type === "token_usage_record") records.push(raw); } catch { /* Incomplete or unsupported records are not usage. */ }
    }
    return { records, truncated: offset > 0, readBytes: bytes,
      source: { pathDigest: digest(path), file: `${stat.dev}:${stat.ino}`, offset, bytes,
        windowDigest: `sha256:${createHash("sha256").update(buffer.subarray(0, bytes)).digest("hex")}` } };
  } finally { closeSync(fd); }
}

export function importContextUsage(workspace: string, entryId: string, transcript: string, captured?: ReturnType<typeof readHostUsageWindow>) {
  const entry = readPromptEntry(workspace, entryId), window = captured ?? readHostUsageWindow(transcript);
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
    const seen = new Set<string>();
    const projectUsage = (id: string, usage: NonNullable<ReturnType<typeof codexUsageRecord>>) => {
      if (store && typeof taskBinding?.taskId === "string" && store.readTask(taskBinding.taskId)) {
        if (!store.hasUsageMeasurement(usage.source, id) && !store.recordUsage({ taskId: taskBinding.taskId, actionId: null, kind: "provider", inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens, reasoningTokens: usage.reasoningTokens,
          durationMs: null, costMicros: null, source: usage.source, measurementId: id })) storeProjectionFailures++;
      }
    };
    for (const raw of window.records) {
      try {
        const usage = codexUsageRecord(raw, String(entry.session), String(entry.turn));
        if (!usage) continue;
        const id = digest({ kind: "usage", provider: "codex", session: usage.session, responseId: usage.responseId }).slice(7);
        if (seen.has(id)) { duplicates++; continue; } seen.add(id);
        const path = join(directory, `${id}.json`), existing = lstatSync(path, { throwIfNoEntry: false });
        if (existing) {
          const prior = read(directory, `${id}.json`);
          if (prior.entryId !== entryId || digest(prior.usage) !== digest(usage)) throw new Error("Native usage attribution conflict");
          projectUsage(id, usage);
          duplicates++; continue;
        }
        if (!publishContextObservation(path, { version: 1, kind: "usage", entryId, createdAt: new Date().toISOString(), usage, source: window.source })) {
          const prior = read(directory, `${id}.json`);
          if (prior.entryId !== entryId || digest(prior.usage) !== digest(usage)) throw new Error("Native usage attribution conflict");
          projectUsage(id, usage);
          duplicates++; continue;
        }
        recorded++;
        projectUsage(id, usage);
      } catch { invalid++; }
    }
  } finally { store?.close(); }
  return { version: 1, entryId, recorded, duplicates, invalid, storeProjectionFailures,
    storeProjection: store ? "idempotent-write-attempted" : switched ? "unallocated-multiple-tasks" : "unavailable-or-unbound", truncated: window.truncated, readBytes: window.readBytes,
    coverage: "matching native response records in a bounded window; missing responses remain unknown", confirmedModelUse: null, avoidedTokens: null };
}

/** A host-supplied transcript links turns on session end; never on the prompt's critical path. */
export function collectContextHostUsage(workspace: string, session: string, transcript: string) {
  try {
    const started = Date.now(), window = readHostUsageWindow(transcript), directory = join(contextStateRoot(workspace), "prompt-session-index", digest(session).slice(7));
    if (!window.records.length) return { state: "format-unrecognized", missingUsage: "unknown" };
    const turns = new Set(window.records.flatMap(raw => {
      const payload = object(object(raw).payload);
      return payload.thread_id === session ? [String(payload.root_turn_id ?? payload.turn_id)] : [];
    }));
    const turnPrefixes = new Set([...turns].map(turn => digest(turn).slice(7)));
    const matching = readdirSync(directory).flatMap(name => {
      const value = entryIndexName(name);
      return value && turnPrefixes.has(value.turn) ? [value] : [];
    });
    const names = [...new Map(matching.map(value => [value.entryId, value])).values()];
    const entries = names.slice(0, 128).flatMap(name => {
      try { const entry = readPromptEntry(workspace, name.entryId); return entry.session === session && turns.has(String(entry.turn)) ? [entry] : []; }
      catch { return []; }
    });
    const unique = entries.filter(entry => entries.filter(other => other.turn === entry.turn).length === 1).slice(0, 32);
    const results = [];
    for (const entry of unique) { if (Date.now() - started > 1000) break; results.push(importContextUsage(workspace, String(entry.entryId), transcript, window)); }
    return { state: results.length ? "observed" : "no-linked-entries", entries: results.length, recorded: results.reduce((sum, value) => sum + value.recorded, 0),
      invalid: results.reduce((sum, value) => sum + value.invalid, 0), ambiguous: entries.length - unique.length,
      truncated: names.length > 128 || window.truncated || unique.length < entries.length || results.length < unique.length, missingUsage: "unknown" };
  } catch { return { state: "unavailable", reason: "native-transcript-or-entry-unavailable", missingUsage: "unknown" }; }
}

/** Explicit observations never rewrite the prepared entry or infer acceptance from a passing check. */
export function recordContextObservation(workspace: string, entryId: string, observation: { kind: "expansion"; path: string } | { kind: "outcome"; disposition: "accepted" | "reopened"; evidence: string }) {
  readPromptEntry(workspace, entryId);
  if (observation.kind === "expansion") safeSubjectPath(observation.path);
  else if (!["accepted", "reopened"].includes(observation.disposition) || !observation.evidence || observation.evidence.length > 512) throw new Error("Outcome requires an evidence reference");
  const id = digest({ entryId, observation }).slice(7), path = join(contextStateRoot(workspace), "context-observations", `${id}.json`);
  publishContextObservation(path, { version: 1, entryId, ...observation, createdAt: new Date().toISOString(), provenance: "host-reported" });
  return { recorded: true, id };
}

export function contextObservationStatus(workspace: string) {
  const root = contextStateRoot(workspace), counts: Record<string, number> = {}, reasons: Record<string, number> = {};
  const usage = { inputTokens: null as number | null, outputTokens: null as number | null, responses: 0 };
  const documentation = new DocumentationObservations();
  let truncated = false, invalid = 0, readBytes = 0;
  for (const collection of ["prompt-entries", "entry-failures", "prompt-rejections", "context-observations"]) {
    const directory = join(root, collection); let names: string[];
    try { names = readdirSync(directory).filter(name => /^[a-f0-9-]+\.json$/u.test(name)).sort(); }
    catch { continue; }
    if (names.length > 1000) truncated = true;
    for (const name of names.slice(0, 1000)) try {
      const size = lstatSync(join(directory, name)).size;
      if (size > 65536 || readBytes + size > 8 * 1024 * 1024) { truncated = true; continue; } readBytes += size;
      const item = read(directory, name), kind = String(item.kind ?? item.status ?? "unknown");
      if (collection === "prompt-entries" && item.workspace === realpathSync(workspace)) documentation.add(item);
      counts[`${collection}:${kind}`] = (counts[`${collection}:${kind}`] ?? 0) + 1;
      const reason = item.reason ?? item.code ?? item.selectionReason;
      if (typeof reason === "string") reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (collection === "context-observations" && kind === "usage") {
        const values = object(item.usage); usage.responses++;
        for (const key of ["inputTokens", "outputTokens"] as const) if (numeric(values[key]) !== null) usage[key] = (usage[key] ?? 0) + Number(values[key]);
      }
    } catch { invalid++; }
  }
  return { version: 1, counts, reasons, usage, documentation: documentation.result(truncated), truncated, invalid, readBytes, selection: "bounded receipt scan; incomplete when truncated",
    confirmedModelUse: null, avoidedTokens: null, benefit: "requires comparable accepted tasks; counters are known subtotals" };
}
