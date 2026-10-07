import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { captureEvaluationEvidence, inspectStaticImage } from "../src/evaluation-images.ts";
import { EVALUATION_LIMITS } from "../src/evaluation-schema.ts";
import { png, jpeg, webp, pngChunk } from "./fixtures/evaluation-images.ts";

test("capture uses actual static PNG/JPEG/WebP bytes and dimensions, not the filename", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-images-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "artifacts"));
  for (const [type, bytes] of [["image/png", png()], ["image/jpeg", jpeg], ["image/webp", webp]] as const) {
    writeFileSync(join(root, "artifacts", "image.wrong-extension"), bytes);
    const [image] = captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "artifacts/image.wrong-extension", role: "actual" }], ["artifacts"]);
    assert.equal(image!.descriptor.mediaType, type); assert.equal(image!.descriptor.width, 2); assert.equal(image!.descriptor.height, 3);
    assert.equal(image!.descriptor.digest, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    assert.equal(image!.dataUrl, `data:${type};base64,${bytes.toString("base64")}`);
    assert.equal(image!.descriptor.bytes, bytes.length);
  }
});
test("renamed identical content has stable semantic descriptor with distinct local provenance", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-rename-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "a.png"), png());
  const first = captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "a.png" }], [root])[0]!;
  renameSync(join(root, "a.png"), join(root, "b.png"));
  const second = captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "b.png" }], [root])[0]!;
  assert.equal(first.descriptor.digest, second.descriptor.digest); assert.equal(first.dataUrl, second.dataUrl);
  assert.notEqual(first.descriptor.reference, second.descriptor.reference);
  writeFileSync(join(root, "b.png"), png(98));
  assert.notEqual(second.descriptor.digest, captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "b.png" }], [root])[0]!.descriptor.digest);
});
test("unapproved roots, symlink files/directories, remote media and traversal fail before capture", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-paths-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "approved")); mkdirSync(join(root, "private")); writeFileSync(join(root, "private/a.png"), png());
  symlinkSync(join(root, "private/a.png"), join(root, "approved/file.png")); symlinkSync(join(root, "private"), join(root, "approved/directory"));
  const capture = (path: string) => captureEvaluationEvidence(root, [{ id: "actual", type: "image", path }], ["approved"]);
  for (const path of ["private/a.png", "approved/../private/a.png", "approved/file.png", "approved/directory/a.png", "https://example.com/a.png", "data:image/png;base64,AAAA", "approved/missing.png"]) assert.throws(() => capture(path));
  assert.throws(() => captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "private/a.png" }], []), /root-unapproved/);
});
test("animation, corrupt containers, false media and unsupported dimensions are explicit errors", () => {
  assert.throws(() => inspectStaticImage(png(42, 2, 3, true)), /animation/);
  for (const bytes of [Buffer.from("not an image"), png().subarray(0, 20), Buffer.concat([png(), Buffer.from("trailing")]), jpeg.subarray(0, -2), webp.subarray(0, -1)]) assert.throws(() => inspectStaticImage(bytes));
  const corrupt = png(); corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1; assert.throws(() => inspectStaticImage(corrupt), /container/);
  const oversized = png(); const header = Buffer.from(oversized.subarray(16, 29)); header.writeUInt32BE(16385);
  const encoded = Buffer.concat([oversized.subarray(0, 8), pngChunk("IHDR", header), oversized.subarray(33)]);
  assert.throws(() => inspectStaticImage(encoded), /dimensions/);
  const animated = Buffer.alloc(30); animated.write("RIFF"); animated.writeUInt32LE(22, 4); animated.write("WEBPVP8X", 8); animated.writeUInt32LE(10, 16); animated[20] = 2;
  assert.throws(() => inspectStaticImage(animated), /animation/);
});
test("byte and count guardrails reject oversized inputs without truncating or reading oversized files", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-image-limits-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "oversized.png"), png()); truncateSync(join(root, "oversized.png"), EVALUATION_LIMITS.imageBytes + 1);
  assert.throws(() => captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "oversized.png" }], [root]), /byte-limit/);
  assert.equal(readFileSync(join(root, "oversized.png")).length, EVALUATION_LIMITS.imageBytes + 1);
  assert.throws(() => captureEvaluationEvidence(root, Array.from({ length: 129 }, (_, i) => ({ id: String(i), type: "image" as const, path: "missing.png" })), [root]), /count-limit/);
});

test("approved parent replacement cannot capture another inode outside the grant", async t => {
  const fs = await import("node:fs"), { syncBuiltinESMExports } = await import("node:module");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-parent-race-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "approved")); mkdirSync(join(root, "outside")); writeFileSync(join(root, "approved/actual.png"), png()); writeFileSync(join(root, "outside/actual.png"), png(98));
  const original = fs.default.openSync; let swapped = false;
  try {
    fs.default.openSync = ((path: any, ...args: any[]) => {
      if (path === join(root, "approved/actual.png") && !swapped) { swapped = true; renameSync(join(root, "approved"), join(root, "saved")); symlinkSync(join(root, "outside"), join(root, "approved")); }
      return (original as any)(path, ...args);
    }) as typeof original; syncBuiltinESMExports();
    assert.throws(() => captureEvaluationEvidence(root, [{ id: "actual", type: "image", path: "approved/actual.png" }], ["approved"]), /changed-during-capture/);
    assert.equal(swapped, true);
  } finally { fs.default.openSync = original; syncBuiltinESMExports(); }
});
test("approved FIFO is rejected before blocking open and cannot bypass the operation deadline", async t => {
  const { spawnSync } = await import("node:child_process"), { resolve } = await import("node:path");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-fifo-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync("mkfifo", [join(root, "image.png")]).status, 0);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import{captureEvaluationEvidence}from${JSON.stringify(resolve("components/engine/src/evaluation-images.ts"))};try{captureEvaluationEvidence(${JSON.stringify(root)},[{id:'actual',type:'image',path:'image.png'}],[${JSON.stringify(root)}]);process.exitCode=1;}catch(error){console.log(error.message);}`], { encoding: "utf8", timeout: 2000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /reference-not-regular/);
});
