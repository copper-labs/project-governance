import { mkdirSync, writeFileSync, chmodSync, openSync, closeSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { readSubjectSource, safeSubjectPath, subjectDigest, worktreeBytes, SourceReadLimitError, type SubjectSource, type ChangeScope } from "./change-subject.ts";
import { digest, durableJson, fileDigest } from "./core.ts";
import { SOURCE_CAPTURE_MAX_BYTES } from "./source-capture-limits.ts";

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
const gitEnv = () => ({ ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" });
const imageName = (index: number, side: "before" | "after") => `${index}-${side}.source`;
const objectHashFor = (oid: string, size: number) =>
  createHash(oid.length === 64 ? "sha256" : "sha1").update(`blob ${size}\0`);

type LargeImage = { name: string; bytes: number; sha256: string };
type PacketOptions = { largeImmutable?: boolean; deadlineAt?: number; cancelled?: () => boolean };

/** Stream only a previously sized immutable blob. The destination is private until packet publication. */
async function captureLargeBlob(root: string, source: SubjectSource, path: string, size: number, deadlineAt: number) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error("Packet capture deadline elapsed");
  const objectHash = objectHashFor(source.identity, size);
  const contentHash = createHash("sha256");
  const fd = openSync(path, "wx", 0o400);
  try {
    const child = spawn("git", ["cat-file", "blob", source.identity], {
      cwd: root, env: gitEnv(),
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

type Side = { source: SubjectSource; index: number; side: "before" | "after" };

function gitBatch(root: string, args: string[], identities: string[], maxBuffer: number, deadlineAt: number) {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error("Packet capture deadline elapsed");
  return execFileSync("git", ["cat-file", ...args], {
    cwd: root, env: gitEnv(), input: identities.join("\n") + "\n", stdio: ["pipe", "pipe", "ignore"],
    maxBuffer, timeout: Math.min(BLOB_TIMEOUT_MS, remainingMs), killSignal: "SIGKILL",
  });
}

/** A bounded batch avoids two Git processes per small source in a large integration. */
async function captureImmutableImages(root: string, scope: ChangeScope, directory: string, deadlineAt: number, assertActive: () => void) {
  const items: Side[] = [];
  for (const [index, record] of scope.records.entries()) for (const side of ["before", "after"] as const) {
    const source = record[side];
    if (!source) continue;
    // An eligible comparison must consist entirely of captured immutable bytes.
    try {
      safeSubjectPath(source.path);
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.identity) ||
          !(source.kind === "git" || source.kind === "index" && scope.mode === "staged" && side === "after"))
        throw new Error("Invalid immutable packet source");
    } catch (error) { throw new PacketCaptureError(source, index, side, error); }
    items.push({ source, index, side });
  }
  const identities = [...new Set(items.map(item => item.source.identity))];
  const metadata = identities.length
    ? gitBatch(root, ["--batch-check=%(objectname) %(objecttype) %(objectsize)"], identities, 8 * 1024 * 1024, deadlineAt).toString("ascii").split("\n")
    : [""];
  if (metadata.pop() !== "" || metadata.length !== identities.length) throw new Error("Invalid Git packet size inventory");
  const sizes = new Map<string, number>();
  for (const [index, id] of identities.entries()) {
    const [reported, type, size, extra] = metadata[index]!.split(" ");
    if (reported !== id || type !== "blob" || extra !== undefined || !/^(?:0|[1-9][0-9]*)$/.test(size ?? "")) continue;
    const bytes = Number(size);
    if (Number.isSafeInteger(bytes)) sizes.set(id, bytes);
  }
  let remaining = LARGE_PACKET_BYTES;
  const sized = items.map(item => {
    const size = sizes.get(item.source.identity);
    try {
      if (size === undefined) throw new Error("Captured Git blob is unavailable");
      const limit = Math.min(remaining, item.source.file_type === "regular" ? LARGE_IMAGE_BYTES : SOURCE_CAPTURE_MAX_BYTES);
      if (size > limit) throw new SourceReadLimitError(size, limit);
      remaining -= size;
      return { ...item, size, name: imageName(item.index, item.side) };
    } catch (error) { throw new PacketCaptureError(item.source, item.index, item.side, error); }
  });
  const captured = new Map<string, LargeImage>();
  let batch: typeof sized = [], batchBytes = 0;
  const flush = () => {
    if (!batch.length) return;
    assertActive();
    let output: Buffer;
    try { output = gitBatch(root, ["--batch"], batch.map(item => item.source.identity), batchBytes, deadlineAt); }
    catch (error) {
      const { source, index, side } = batch[0]!;
      throw new PacketCaptureError(source, index, side, error);
    }
    let offset = 0;
    for (const item of batch) {
      try {
        const header = Buffer.from(`${item.source.identity} blob ${item.size}\n`);
        if (!output.subarray(offset, offset + header.length).equals(header)) throw new Error("Invalid Git blob frame");
        offset += header.length;
        const bytes = output.subarray(offset, offset + item.size);
        offset += item.size;
        if (bytes.length !== item.size || output[offset++] !== 10 ||
            objectHashFor(item.source.identity, item.size).update(bytes).digest("hex") !== item.source.identity)
          throw new Error("Git blob did not match its captured identity");
        writeFileSync(join(directory, item.name), bytes, { flag: "wx", mode: 0o400 });
        captured.set(item.name, { name: item.name, bytes: item.size, sha256: sha256(bytes) });
      } catch (error) { throw new PacketCaptureError(item.source, item.index, item.side, error); }
    }
    if (offset !== output.length) throw new Error("Unexpected trailing Git blob data");
    batch = []; batchBytes = 0;
  };
  for (const item of sized) {
    if (item.size > SOURCE_CAPTURE_MAX_BYTES) {
      flush(); assertActive();
      try {
        const hash = await captureLargeBlob(root, item.source, join(directory, item.name), item.size, deadlineAt);
        captured.set(item.name, { name: item.name, bytes: item.size, sha256: hash });
      } catch (error) { throw new PacketCaptureError(item.source, item.index, item.side, error); }
    } else {
      const frameSize = item.size + Buffer.byteLength(`${item.source.identity} blob ${item.size}\n\n`);
      if (batchBytes + frameSize > SOURCE_CAPTURE_MAX_BYTES) flush();
      batch.push(item); batchBytes += frameSize;
    }
  }
  flush();
  return captured;
}

/** Publish version-one packet bytes only after all captured images finish and verify. */
export async function materializeChangePacket(root: string, scope: ChangeScope, directory: string, options: PacketOptions = {}) {
  const logicalDigest = scope.scope === "all" ? null : subjectDigest(scope.records);
  if (scope.subject_digest !== logicalDigest) throw new Error("Change packet logical identity mismatch");
  const largeImmutable = options.largeImmutable === true && scope.scope === "changed" && !scope.unborn &&
    !!scope.base_ref && (scope.mode === "staged" || !!scope.candidate_ref);
  const largeAfter = new Map<string, LargeImage>();
  const deadlineAt = options.deadlineAt ?? Infinity;
  const assertActive = () => {
    if (Date.now() >= deadlineAt || options.cancelled?.()) throw new Error("Packet capture interrupted");
  };
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  try {
    const captured = largeImmutable ? await captureImmutableImages(root, scope, directory, deadlineAt, assertActive) : null;
    const records = [];
    for (const [index, record] of scope.records.entries()) {
      const wire: Record<string, unknown> = { status: record.status, path: record.path, previous_path: record.previous_path, changed_ranges: record.changed_ranges };
      for (const side of ["before", "after"] as const) {
        const source = record[side];
        const name = imageName(index, side);
        const path = source ? resolve(directory, name) : null;
        let hash: string | null = null;
        if (source && path) {
          try {
            assertActive();
            const image = captured?.get(name);
            if (captured) {
              if (!image) throw new Error("Incomplete immutable image inventory");
              hash = image.sha256;
              if (side === "after" && image.bytes > SOURCE_CAPTURE_MAX_BYTES) largeAfter.set(record.path, image);
            } else {
              const bytes = readSubjectSource(root, source);
              writeFileSync(path, bytes, { flag: "wx", mode: 0o400 });
              hash = sha256(bytes);
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
      ...(scope.candidate_ref ? { candidate_ref: scope.candidate_ref } : {}),
      ...(scope.candidate_tree ? { candidate_tree: scope.candidate_tree } : {}), subject_digest: logicalDigest, records };
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
