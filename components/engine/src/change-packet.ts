import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { readSubjectSource, subjectDigest, SourceReadLimitError, type SubjectSource, type ChangeScope } from "./change-subject.ts";
import { digest, durableJson, fileDigest } from "./core.ts";

export class PacketCaptureError extends Error {
  readonly capture: { reason: "source-over-limit" | "source-unavailable"; record: number; side: "before" | "after"; source_kind: SubjectSource["kind"]; path_digest: string; size_bytes?: number; limit_bytes?: number };
  constructor(source: SubjectSource, record: number, side: "before" | "after", error: unknown) {
    super("Change packet source capture failed");
    this.capture = { reason: error instanceof SourceReadLimitError ? "source-over-limit" : "source-unavailable", record, side,
      source_kind: source.kind, path_digest: digest(source.path), ...(error instanceof SourceReadLimitError ? { size_bytes: error.sizeBytes, limit_bytes: error.limitBytes } : {}) };
  }
}

/** Materialized byte snapshots preserve the existing target-checker packet contract. */
export function materializeChangePacket(root: string, scope: ChangeScope, directory: string) {
  const digest = scope.scope === "all" ? null : subjectDigest(scope.records);
  if (scope.subject_digest !== digest) throw new Error("Change packet logical identity mismatch");
  // Resolve every source before publication. A stale worktree image cannot produce a runnable packet.
  const read = (source: SubjectSource | null, index: number, side: "before" | "after") => {
    if (!source) return null;
    try { return readSubjectSource(root, source); }
    catch (error) { throw new PacketCaptureError(source, index, side, error); }
  };
  const images = scope.records.map((record, index) => ({ before: read(record.before, index, "before"), after: read(record.after, index, "after") }));
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const records = scope.records.map((record, index) => {
    const wire: Record<string, unknown> = { status: record.status, path: record.path, previous_path: record.previous_path, changed_ranges: record.changed_ranges };
    for (const side of ["before", "after"] as const) {
      const source = record[side], bytes = images[index]![side];
      const path = bytes === null ? null : resolve(directory, `${index}-${side}.source`);
      if (path && bytes) { writeFileSync(path, bytes, { flag: "wx", mode: 0o400 }); }
      wire[`${side}_path`] = path;
      wire[`${side}_sha256`] = bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
      wire[`${side}_file_type`] = source?.file_type ?? null;
    }
    return wire;
  });
  const packet = { kind: scope.kind, version: scope.version, scope: scope.scope, mode: scope.mode, base_ref: scope.base_ref, ...(scope.candidate_ref ? { candidate_ref: scope.candidate_ref } : {}), subject_digest: digest, records };
  const path = join(directory, "change-packet.json"); durableJson(path, packet); chmodSync(path, 0o400);
  const env: Record<string, string> = { PROJECT_GOVERNANCE_ROOT: root, PROJECT_GOVERNANCE_CHANGE_PACKET: path, PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256: fileDigest(path).slice(7) };
  if (digest) env["PROJECT_GOVERNANCE_SUBJECT_DIGEST"] = digest;
  return { packet, path, env };
}
