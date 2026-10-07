import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { digest } from "./core.ts";
import { EVALUATION_LIMITS, type CapturedEvaluationEvidence, type EvaluationEvidence } from "./evaluation-schema.ts";

function dimensions(width: number, height: number) {
  if (!width || !height || width > EVALUATION_LIMITS.dimension || height > EVALUATION_LIMITS.dimension || width * height > EVALUATION_LIMITS.pixels) throw new Error("image-dimensions-invalid");
  return { width, height };
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Inspect the bounded full container, rather than trusting an extension or one magic byte. */
export function inspectStaticImage(bytes: Buffer): { mediaType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number } {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let position = 8, width = 0, height = 0, data = false, ended = false;
    while (position + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(position), end = position + 12 + length;
      if (end > bytes.length) throw new Error("image-container-invalid");
      const type = bytes.toString("ascii", position + 4, position + 8);
      if (crc32(bytes.subarray(position + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error("image-container-invalid");
      if (position === 8 && (type !== "IHDR" || length !== 13)) throw new Error("image-container-invalid");
      if (["acTL", "fcTL", "fdAT"].includes(type)) throw new Error("image-animation-unsupported");
      if (type === "IHDR") {
        if (position !== 8) throw new Error("image-container-invalid");
        width = bytes.readUInt32BE(position + 8); height = bytes.readUInt32BE(position + 12);
        const depth = bytes[position + 16]!, color = bytes[position + 17]!;
        if (!({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] } as Record<number, number[]>)[color]?.includes(depth) ||
            bytes[position + 18] !== 0 || bytes[position + 19] !== 0 || ![0, 1].includes(bytes[position + 20]!)) throw new Error("image-container-invalid");
      }
      if (type === "IDAT" && length > 0) data = true;
      if (type === "IEND") { if (length || end !== bytes.length || !data) throw new Error("image-container-invalid"); ended = true; break; }
      position = end;
    }
    if (!ended) throw new Error("image-container-invalid");
    return { mediaType: "image/png", ...dimensions(width, height) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let position = 2, width = 0, height = 0, scan = false, ended = false;
    while (position < bytes.length) {
      if (bytes[position++] !== 0xff) throw new Error("image-container-invalid");
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xd9) { ended = position === bytes.length; break; }
      if (marker === undefined || marker === 0 || marker === 0xd8 || position + 2 > bytes.length) throw new Error("image-container-invalid");
      const length = bytes.readUInt16BE(position), end = position + length;
      if (length < 2 || end > bytes.length) throw new Error("image-container-invalid");
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8 || width || bytes[position + 2] !== 8) throw new Error("image-container-invalid");
        height = bytes.readUInt16BE(position + 3); width = bytes.readUInt16BE(position + 5);
      }
      if (marker === 0xe2 && bytes.toString("ascii", position + 2, position + 6) === "MPF\0") throw new Error("image-multiple-frames-unsupported");
      position = end;
      if (marker === 0xda) {
        if (!width || length < 6) throw new Error("image-container-invalid"); scan = true;
        for (;;) {
          if (position >= bytes.length) throw new Error("image-container-invalid");
          if (bytes[position] !== 0xff) { position++; continue; }
          let next = position + 1; while (bytes[next] === 0xff) next++;
          if (bytes[next] === 0 || (bytes[next]! >= 0xd0 && bytes[next]! <= 0xd7)) { position = next + 1; continue; }
          break;
        }
      }
    }
    if (!scan || !ended) throw new Error("image-container-invalid");
    return { mediaType: "image/jpeg", ...dimensions(width, height) };
  }
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("image-container-invalid");
    let position = 12, width = 0, height = 0, image = false;
    while (position + 8 <= bytes.length) {
      const type = bytes.toString("ascii", position, position + 4), length = bytes.readUInt32LE(position + 4), start = position + 8, end = start + length;
      if (end + (length & 1) > bytes.length) throw new Error("image-container-invalid");
      if (["ANIM", "ANMF"].includes(type)) throw new Error("image-animation-unsupported");
      if (type === "VP8X") {
        if (position !== 12 || length !== 10 || bytes[start]! & 2) throw new Error("image-animation-or-container-invalid");
        width = bytes.readUIntLE(start + 4, 3) + 1; height = bytes.readUIntLE(start + 7, 3) + 1;
      }
      if (type === "VP8 ") {
        if (image || length < 10 || !bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) throw new Error("image-container-invalid");
        const actualWidth = bytes.readUInt16LE(start + 6) & 0x3fff, actualHeight = bytes.readUInt16LE(start + 8) & 0x3fff;
        if (width && (width !== actualWidth || height !== actualHeight)) throw new Error("image-dimensions-invalid");
        width = actualWidth; height = actualHeight; image = true;
      }
      if (type === "VP8L") {
        if (image || length < 5 || bytes[start] !== 0x2f) throw new Error("image-container-invalid");
        const bits = bytes.readUInt32LE(start + 1), actualWidth = (bits & 0x3fff) + 1, actualHeight = ((bits >>> 14) & 0x3fff) + 1;
        if (bits >>> 29 || width && (width !== actualWidth || height !== actualHeight)) throw new Error("image-dimensions-invalid");
        width = actualWidth; height = actualHeight; image = true;
      }
      position = end + (length & 1);
    }
    if (!image || position !== bytes.length) throw new Error("image-container-invalid");
    return { mediaType: "image/webp", ...dimensions(width, height) };
  }
  throw new Error("image-format-unsupported");
}

function capturedImage(workspace: string, item: Extract<EvaluationEvidence, { type: "image" }>, approved: string[], remaining: number): CapturedEvaluationEvidence {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(item.path) || /[\x00-\x1f]/u.test(item.path)) throw new Error("image-reference-invalid");
  const path = isAbsolute(item.path) ? resolve(item.path) : resolve(workspace, item.path);
  const roots = approved.map(root => realpathSync(isAbsolute(root) ? root : resolve(workspace, root)));
  const root = roots.find(root => { const rel = relative(root, path); return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); });
  if (!root) throw new Error("image-root-unapproved");
  const inspected = [{ path: root, stat: lstatSync(root) }];
  let current = root;
  for (const segment of relative(root, path).split(sep)) {
    current = join(current, segment); const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("image-symlink-unsupported"); inspected.push({ path: current, stat });
  }
  const leaf = inspected.at(-1)!.stat;
  if (!leaf.isFile()) throw new Error("image-reference-not-regular");
  const limit = Math.min(EVALUATION_LIMITS.imageBytes, remaining);
  if (leaf.size < 1 || leaf.size > limit) throw new Error("image-byte-limit");
  const stablePath = () => inspected.every(({ path, stat }) => {
    const actual = lstatSync(path);
    return !actual.isSymbolicLink() && actual.dev === stat.dev && actual.ino === stat.ino && actual.isDirectory() === stat.isDirectory();
  }) && realpathSync(path) === path;
  if (realpathSync(path) !== path) throw new Error("image-path-escape");
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile() || before.dev !== leaf.dev || before.ino !== leaf.ino || before.size !== leaf.size ||
        before.mtimeMs !== leaf.mtimeMs || before.ctimeMs !== leaf.ctimeMs || !stablePath()) throw new Error("image-changed-during-capture");
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, null); if (!count) throw new Error("image-changed-during-capture"); offset += count; }
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !stablePath()) throw new Error("image-changed-during-capture");
    const format = inspectStaticImage(bytes);
    return { descriptor: { id: item.id, type: "image", role: item.role ?? null, reference: item.path, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, bytes: bytes.length, ...format }, dataUrl: `data:${format.mediaType};base64,${bytes.toString("base64")}` };
  } finally { if (fd !== undefined) closeSync(fd); }
}
/** Capture exactly once before identity and spending; no original media enters ordinary receipts. */
export function captureEvaluationEvidence(workspace: string, evidence: EvaluationEvidence[], roots: string[]): CapturedEvaluationEvidence[] {
  if (evidence.filter(item => item.type === "image").length > EVALUATION_LIMITS.images) throw new Error("image-count-limit");
  let remaining = EVALUATION_LIMITS.totalImageBytes;
  return evidence.map(item => {
    if (item.type === "text") return { descriptor: { id: item.id, type: "text", role: item.role ?? null, digest: digest(item.text), bytes: Buffer.byteLength(item.text) }, text: item.text };
    const image = capturedImage(workspace, item, roots, remaining); remaining -= image.descriptor.bytes; return image;
  });
}
