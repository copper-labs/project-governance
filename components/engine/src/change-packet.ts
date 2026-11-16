import { mkdirSync, writeFileSync, chmodSync, openSync, closeSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { readSubjectSource, subjectDigest, worktreeBytes, SourceReadLimitError, type SubjectSource, type ChangeScope } from "./change-subject.ts";
import { digest, durableJson, fileDigest } from "./core.ts";

export class PacketCaptureError extends Error {
  readonly capture: { reason: "source-over-limit" | "source-unavailable"; record: number; side: "before" | "after"; source_kind: SubjectSource["kind"]; path_digest: string; size_bytes?: number; limit_bytes?: number };
  constructor(source: SubjectSource, record: number, side: "before" | "after", error: unknown) {
    super("Change packet source capture failed");
    this.capture = { reason: error instanceof SourceReadLimitError ? "source-over-limit" : "source-unavailable", record, side,
      source_kind: source.kind, path_digest: digest(source.path), ...(error instanceof SourceReadLimitError ? { size_bytes: error.sizeBytes, limit_bytes: error.limitBytes } : {}) };
  }
}


const LARGE_IMAGE_BYTES = 128 * 1024 * 1024;
const LARGE_PACKET_BYTES = 512 * 1024 * 1024;
const BLOB_TIMEOUT_MS = 30_000;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

type LargeImage = { name: string; bytes: number; sha256: string };
type PacketOptions = { largeImmutable?: boolean; deadlineAt?: number; cancelled?: () => boolean };

/** Stream only a previously sized immutable blob. The destination is private until packet publication. */
async function captureLargeBlob(root: string, source: SubjectSource, path: string, size: number, deadlineAt: number) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error("Packet capture deadline elapsed");
  const objectHash = createHash(source.identity.length === 64 ? "sha256" : "sha1").update(`blob ${size}\0`);
  const contentHash = createHash("sha256");
  const fd = openSync(path, "wx", 0o400);
  try {
    const child = spawn("git", ["cat-file", "blob", source.identity], {
      cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let failed = false;
    child.once("error", () => { failed = true; });
    const closed = new Promise<number | null>(resolve => child.once("close", resolve));
    const timer = setTimeout(() => { failed = true; child.kill("SIGKILL"); }, Math.min(BLOB_TIMEOUT_MS, remainingMs));
    try {
      let bytes = 0;
      for await (const chunk of child.stdout) {
        bytes += chunk.length;
        if (bytes > size) throw new Error("Git blob exceeded its captured size");
        objectHash.update(chunk);
        contentHash.update(chunk);
        writeFileSync(fd, chunk);
      }
      const code = await closed;
      if (failed || code !== 0 || bytes !== size || objectHash.digest("hex") !== source.identity)
        throw new Error("Git blob did not match its captured identity");
      return contentHash.digest("hex");
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
      throw error;
    } finally { clearTimeout(timer); }
  } finally { closeSync(fd); }
}

/** Publish version-one packet bytes only after all captured images finish and verify. */
export async function materializeChangePacket(root: string, scope: ChangeScope, directory: string, options: PacketOptions = {}) {
  const logicalDigest = scope.scope === "all" ? null : subjectDigest(scope.records);
  if (scope.subject_digest !== logicalDigest) throw new Error("Change packet logical identity mismatch");
  const largeImmutable = options.largeImmutable === true && scope.scope === "changed" && !scope.unborn &&
    !!scope.base_ref && (scope.mode === "staged" || !!scope.candidate_ref);
  let remaining = largeImmutable ? LARGE_PACKET_BYTES : Infinity;
  const largeAfter = new Map<string, LargeImage>();
  const deadlineAt = options.deadlineAt ?? Infinity;
  const assertActive = () => {
    if (Date.now() >= deadlineAt || options.cancelled?.()) throw new Error("Packet capture interrupted");
  };
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  try {
    const records = [];
    for (const [index, record] of scope.records.entries()) {
      const wire: Record<string, unknown> = { status: record.status, path: record.path, previous_path: record.previous_path, changed_ranges: record.changed_ranges };
      for (const side of ["before", "after"] as const) {
        const source = record[side];
        const name = `${index}-${side}.source`;
        const path = source ? resolve(directory, name) : null;
        let hash: string | null = null;
        if (source && path) {
          try {
            assertActive();
            let bytes: Buffer | undefined;
            try { bytes = readSubjectSource(root, source); }
            catch (error) {
              const immutable = source.file_type === "regular" &&
                (source.kind === "git" || source.kind === "index" && scope.mode === "staged" && side === "after");
              if (!largeImmutable || !immutable || !(error instanceof SourceReadLimitError)) throw error;
              const limit = Math.min(LARGE_IMAGE_BYTES, remaining);
              if (error.sizeBytes > limit) throw new SourceReadLimitError(error.sizeBytes, limit);
              hash = await captureLargeBlob(root, source, path, error.sizeBytes, deadlineAt);
              remaining -= error.sizeBytes;
              if (side === "after") largeAfter.set(record.path, { name, bytes: error.sizeBytes, sha256: hash });
            }
            if (bytes !== undefined) {
              if (bytes.length > remaining) throw new SourceReadLimitError(bytes.length, remaining);
              writeFileSync(path, bytes, { flag: "wx", mode: 0o400 });
              hash = sha256(bytes);
              remaining -= bytes.length;
            }
          } catch (error) { throw new PacketCaptureError(source, index, side, error); }
        }
        wire[`${side}_path`] = path;
        wire[`${side}_sha256`] = hash;
        wire[`${side}_file_type`] = source?.file_type ?? null;
      }
      records.push(wire);
    }
    assertActive();
    const packet = { kind: scope.kind, version: scope.version, scope: scope.scope, mode: scope.mode, base_ref: scope.base_ref,
      ...(scope.candidate_ref ? { candidate_ref: scope.candidate_ref } : {}), subject_digest: logicalDigest, records };
    const path = join(directory, "change-packet.json");
    durableJson(path, packet);
    chmodSync(path, 0o400);
    const env: Record<string, string> = { PROJECT_GOVERNANCE_ROOT: root, PROJECT_GOVERNANCE_CHANGE_PACKET: path,
      PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256: fileDigest(path).slice(7) };
    if (logicalDigest) env["PROJECT_GOVERNANCE_SUBJECT_DIGEST"] = logicalDigest;
    // The formatter uses only its already captured, approved-size after images.
    const readLargeAfter = (relative: string): Buffer | undefined => {
      const image = largeAfter.get(relative);
      if (!image) return undefined;
      const { bytes, type } = worktreeBytes(directory, image.name, image.bytes);
      if (type !== "regular" || bytes.length !== image.bytes || sha256(bytes) !== image.sha256)
        throw new Error("Large packet format input changed");
      return bytes;
    };
    return { packet, path, env, readLargeAfter };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
