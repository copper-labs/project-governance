import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { digest, object, text } from "./core.ts";

/** Offline, explicitly selected evidence. A file identity proves its bytes, not acceptance of work. */
export function decisionOutcomeReport(stateRoot: string, manifestPath: string, reader = boundedOutcomeReader()) {
  const read = reader.read;
  const manifest = read(resolve(manifestPath));
  if ((manifest.version !== 1 && manifest.version !== 2) || !Array.isArray(manifest.episodes) || manifest.episodes.length > 1000) throw new Error("Outcome manifest requires version 1 or 2 and at most 1000 episodes");
  const counts = { selected: manifest.episodes.length, joined: 0, invalid: 0, duplicate_episodes: 0, duplicate_decisions: 0, missing_decisions: 0, missing_native: 0, unlabelled: 0, unscoped_decisions: 0, no_linked_decisions: 0, duplicate_native: 0, duplicate_reservations: 0, missing_captures: 0 };
  const labels: Record<string, number> = {};
  const seenEpisodes = new Set<string>(), seenDecisions = new Set<string>();
  const seenNative = new Set<string>(), seenReservations = new Set<string>();
  const samples: Array<Record<string, unknown>> = [];
  const reference = (raw: unknown) => {
    const ref = object(raw), path = text(ref.path, "evidence path", 4096), hash = text(ref.digest, "evidence digest", 80);
    if (!/^sha256:[a-f0-9]{64}$/u.test(hash)) throw new Error("Canonical evidence digest required");
    return read(isAbsolute(path) ? path : resolve(dirname(manifestPath), path), hash);
  };
  const scopeIdentity = (value: unknown) => {
    if (value === null) return null;
    const binding = object(value, "episode scope");
    return JSON.stringify([realpathSync(text(binding.workspace, "workspace")), text(binding.taskId, "task identity"), text(binding.taskRevision, "task revision")]);
  };
  // Only structured receiptId fields count as caller delivery links. Prose is never searched.
  const callerReceiptIds = (value: unknown, depth = 0): string[] => {
    if (depth > 16 || !value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(item => callerReceiptIds(item, depth + 1));
    const record = value as Record<string, unknown>;
    return [...(typeof record.receiptId === "string" ? [record.receiptId] : []),
      ...Object.entries(record).filter(([key]) => key !== "receiptId").flatMap(([, item]) => callerReceiptIds(item, depth + 1))];
  };
  for (const raw of manifest.episodes) {
    try {
      const episode = object(raw), id = text(episode.id, "episode id", 256);
      if (seenEpisodes.has(id)) { counts.duplicate_episodes++; continue; }
      seenEpisodes.add(id);
      if (!Array.isArray(episode.decisions) || episode.decisions.length > 64 || (manifest.version === 1 && !episode.decisions.length) ||
          episode.decisions.some(value => typeof value !== "string" || !/^[a-f0-9]{32}$/u.test(value))) throw new Error("Invalid episode decision references");
      let caller: Record<string, unknown>;
      try { caller = reference(episode.caller); }
      catch (error) { if (manifest.version === 2) counts.missing_captures++; throw error; }
      const links = new Set(callerReceiptIds(caller));
      let episodeScope: string | null = null;
      if (manifest.version === 2) {
        episodeScope = scopeIdentity(episode.scope);
        if (caller.version !== 1 || caller.id !== id || scopeIdentity(caller.scope) !== episodeScope) throw new Error("Caller episode binding mismatch");
        const native = object(caller.native, "caller native identity");
        const hash = (value: unknown) => /^sha256:[a-f0-9]{64}$/u.test(String(value));
        if (caller.entryKind === "check-plan") {
          if (!hash(native.subjectDigest) || !hash(native.planDigest) || (Array.isArray(episode.native) && episode.native.length > 0)) throw new Error("Check plan identity required");
        } else if (["check-output", "check-completion"].includes(String(caller.entryKind))) {
          text(native.runId, "caller run id", 256);
          if (!hash(native.resultDigest)) throw new Error("Check result identity required");
        } else if (["provider-submit", "provider-completion"].includes(String(caller.entryKind))) {
          if (!hash(native.requestDigest) || (caller.entryKind === "provider-completion" && (!hash(native.commandResultDigest) || (native.resultDigest !== null && !hash(native.resultDigest))))) throw new Error("Provider identity required");
        } else {
          text(native.runId, "caller run id", 256);
          if (![native.runDigest, native.stagesDigest, native.eventsDigest].every(hash)) throw new Error("Caller native digests required");
        }
        if (caller.assignment !== undefined) {
          const assignment = object(caller.assignment);
          if (assignment.episodeId !== id || scopeIdentity(assignment.scope) !== episodeScope) throw new Error("Assignment scope conflicts with episode");
        }
        if (episode.assignment !== undefined && digest(episode.assignment) !== digest(caller.assignment)) throw new Error("Assigned arm conflicts with captured assignment");
      }
      const decisions: Array<Record<string, unknown>> = [];
      const pendingIds = new Set<string>();
      let scope: string | null = episodeScope;
      const pendingReservations = new Set<string>(), pendingNative = new Set<string>();
      for (const receiptId of episode.decisions as string[]) {
        if (pendingIds.has(receiptId) || (manifest.version === 1 && seenDecisions.has(receiptId))) { counts.duplicate_decisions++; continue; }
        if (seenDecisions.has(receiptId)) counts.duplicate_decisions++;
        if (!links.has(receiptId)) { counts.missing_decisions++; continue; }
        let receipt: Record<string, unknown>;
        try { receipt = read(join(stateRoot, "decisions", `${receiptId}.json`)); }
        catch { counts.missing_decisions++; continue; }
        if (receipt.version !== 2 || receipt.receiptId !== receiptId) throw new Error("Decision receipt identity mismatch");
        const outcome = object(receipt.outcome);
        if (outcome.scope === null) counts.unscoped_decisions++;
        else {
        const binding = object(outcome.scope);
        const identity = manifest.version === 2 ? scopeIdentity(binding) : JSON.stringify([text(binding.workspace, "workspace"), text(binding.taskId, "task identity"), text(binding.taskRevision, "task revision")]);
        if (scope !== null && scope !== identity) throw new Error("An episode cannot mix decision task revisions");
        scope = identity;
        }
        if (outcome.version !== 2 || typeof outcome.delivered !== "boolean") throw new Error("Invalid decision outcome");
        const budget = outcome.budget === undefined ? {} : object(outcome.budget);
        const reservation = typeof budget.reservationId === "string" ? budget.reservationId : null;
        const duplicateReservation = reservation !== null && (seenReservations.has(reservation) || pendingReservations.has(reservation));
        if (duplicateReservation) counts.duplicate_reservations++;
        if (reservation !== null) pendingReservations.add(reservation);
        decisions.push({ id: receiptId, consumerIds: outcome.consumers, mode: outcome.mode, delivered: outcome.delivered, reason: outcome.reason,
          ...(manifest.version === 2 ? { reservationId: reservation, duplicateReservation, providerCalled: typeof outcome.providerCalled === "boolean" ? outcome.providerCalled : null, usage: outcome.usage ?? null } : {}) });
        pendingIds.add(receiptId);
      }
      if (!decisions.length && (manifest.version === 1 || episode.decisions.length > 0)) { counts.no_linked_decisions++; continue; }
      const native: Array<Record<string, unknown>> = [];
      if (episode.native === undefined || (Array.isArray(episode.native) && !episode.native.length)) counts.missing_native++;
      else {
        if (!Array.isArray(episode.native) || episode.native.length > 16) throw new Error("Invalid native evidence list");
        const nativeSeen = new Set<string>();
        for (const rawRef of episode.native) {
          const ref = object(rawRef), record = reference(ref);
          if (manifest.version === 2 && record.scope !== undefined && scopeIdentity(record.scope) !== episodeScope) throw new Error("Native scope conflicts with episode");
          const key = String(ref.digest); if (nativeSeen.has(key)) continue; nativeSeen.add(key);
          if (ref.kind === "command") {
            if (record.version !== 1 || !/^sha256:[a-f0-9]{64}$/u.test(String(record.requestDigest)) ||
              !["succeeded", "failed", "cancelled", "unknown"].includes(String(record.state)) || !["confirmed", "unknown"].includes(String(record.cleanup))) throw new Error("Invalid native command outcome");
            native.push({ kind: "command", state: record.state, cleanup: record.cleanup, requestDigest: record.requestDigest });
          } else if (ref.kind === "check") {
            if (record.version !== 1 || !["passed", "failed", "warning", "blocked"].includes(String(record.status)) ||
              !/^sha256:[a-f0-9]{64}$/u.test(String(record.result_digest))) throw new Error("Invalid native check metrics");
            native.push({ kind: "check", state: record.status, resultDigest: record.result_digest });
          } else throw new Error("Unsupported native outcome kind");
          if (manifest.version === 2) {
            const captured = object(caller.native);
            if (caller.entryKind === "provider-completion" || caller.entryKind === "provider-submit") {
              if (ref.kind !== "command" || record.requestDigest !== captured.requestDigest || (caller.entryKind === "provider-completion" &&
                  (digest(record) !== captured.commandResultDigest || (record.providerResultDigest ?? null) !== captured.resultDigest || record.state !== captured.status)))
                throw new Error("Provider native evidence belongs to another submission or result");
            } else if (caller.entryKind === "check-completion" || caller.entryKind === "check-output") {
              // Check metrics bind the byte digest; the episode also binds the canonical result digest.
              if (ref.kind !== "check" || record.run_id !== captured.runId || record.result_digest !== captured.resultFileDigest) throw new Error("Check native evidence belongs to another run");
            }
            const identity = ref.kind === "command" ? String(record.requestDigest) : String(record.result_digest);
            const costKey = `${String(ref.kind)}:${identity}`;
            const duplicateCost = seenNative.has(costKey) || pendingNative.has(costKey);
            if (duplicateCost) counts.duplicate_native++;
            pendingNative.add(costKey);
            Object.assign(native[native.length - 1]!, { duplicateCost,
              durationMs: typeof record.durationMs === "number" && Number.isFinite(record.durationMs) && record.durationMs >= 0 ? record.durationMs : null });
          }
        }
      }
      const review = episode.labels ?? [];
      if (!Array.isArray(review) || review.length > 16) throw new Error("Invalid outcome labels");
      const selectedLabels: Array<{ reviewer: string; disposition: string; at: string }> = [];
      for (const rawLabel of review) {
        const label = object(rawLabel), reviewer = text(label.reviewer, "label provenance", 256), at = text(label.at, "label time", 64), disposition = text(label.disposition, "label disposition", 32);
        if (!Number.isFinite(Date.parse(at)) || !["accepted", "reopened", "rejected", "useful", "unhelpful", "uncertain"].includes(disposition)) throw new Error("Invalid outcome label");
        if (!selectedLabels.some(item => item.reviewer === reviewer && item.at === at && item.disposition === disposition)) selectedLabels.push({ reviewer, disposition, at });
      }
      const observations = episode.observations === undefined ? {} : object(episode.observations);
      const observed: Record<string, number | null> = {};
      for (const name of ["followupReadBytes", "interventions", "reworkMinutes", "llmInputTokens", "llmOutputTokens", ...(manifest.version === 2 ? ["elapsedMs", "summedProcessMs"] : [])]) {
        const value = observations[name] ?? null;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error("Invalid outcome observation");
        observed[name] = value as number | null;
      }
      for (const key of pendingIds) seenDecisions.add(key);
      for (const key of pendingReservations) seenReservations.add(key);
      for (const key of pendingNative) seenNative.add(key);
      for (const label of selectedLabels) labels[label.disposition] = (labels[label.disposition] ?? 0) + 1;
      if (!selectedLabels.length) counts.unlabelled++;
      counts.joined++;
      samples.push({ episode: id, decisions, native, labels: selectedLabels, observations: observed,
        ...(manifest.version === 2 ? { scope: episode.scope, assignment: caller.assignment ?? null, exposure: caller.exposure ?? null } : {}) });
    } catch { counts.invalid++; }
  }
  const nativeCosts = samples.flatMap(sample => sample.native as Array<Record<string, unknown>>).filter(item => !item.duplicateCost);
  const durations = nativeCosts.map(item => item.durationMs).filter((value): value is number => typeof value === "number");
  return { version: manifest.version, counts, labels, samples,
    ...(manifest.version === 2 ? { native_cost: { knownSummedDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
      knownRecords: durations.length, unknownRecords: nativeCosts.length - durations.length, missingNativeEpisodes: counts.missing_native,
      meaning: "deduplicated native process durations; not elapsed episode time or avoided work" } } : {}), read_bytes: reader.bytesRead(),
    association: "caller receipt links verified; later native results and labels associated by the operator manifest, not inferred proof",
    observation_provenance: "manifest-supplied; missing values are unknown; labels may disagree",
    selection: "explicit episodes; not a representative or causal comparison", avoided_llm_tokens: null, benefit_claim: "not-evaluated" };
}

/** Bound all explicit references under one per-report byte allowance. */
export function boundedOutcomeReader() {
  let bytesRead = 0;
  const read = (path: string, expected?: string): Record<string, unknown> => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size > 262144 || bytesRead + before.size > 16777216) throw new Error("Outcome evidence exceeds read budget");
      const bytes = Buffer.alloc(before.size + 1); let size = 0;
      while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
      bytesRead += size;
      const after = fstatSync(fd);
      if (size !== before.size || before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new Error("Outcome evidence changed during read");
      const content = bytes.subarray(0, size);
      if (expected !== undefined && `sha256:${createHash("sha256").update(content).digest("hex")}` !== expected) throw new Error("Outcome evidence digest mismatch");
      return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)));
    } finally { closeSync(fd); }
  };
  return { read, bytesRead: () => bytesRead };
}
