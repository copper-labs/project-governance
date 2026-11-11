import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const packageRoot = process.env.GOVERNANCE_TEST_PACKAGE;
const moduleUrl = packageRoot
  ? pathToFileURL(join(realpathSync(packageRoot), "dist/engine/src/checkers/secret-blob-batch.js")).href
  : new URL("../src/checkers/secret-blob-batch.ts", import.meta.url).href;
const { parseSecretBlobBatch, scanSecretBlobBatch } = await import(moduleUrl) as typeof import("../src/checkers/secret-blob-batch.ts");

const first = "a".repeat(40), second = "b".repeat(64);
const frame = (oid: string, body: Buffer) => Buffer.concat([Buffer.from(oid + " blob " + body.length + "\n"), body, Buffer.from("\n")]);
async function* fragmented(bytes: Buffer) { for (let i = 0; i < bytes.length; i++) yield bytes.subarray(i, i + 1); }

test("batch framing preserves binary bytes, empty blobs, both object formats and chunk-spanning signatures", async () => {
  const body = Buffer.concat([Buffer.from([0, 255, 10]), Buffer.from("ghp_" + "A".repeat(36))]);
  const result = await parseSecretBlobBatch(fragmented(Buffer.concat([frame(first, body), frame(second, Buffer.alloc(0))])), [first, second]);
  assert.deepEqual(result.get(first), { detectorIds: ["github-token"], sha256: createHash("sha256").update(body).digest("hex") });
  assert.deepEqual(result.get(second), { detectorIds: [], sha256: createHash("sha256").digest("hex") });
});

test("large framed blobs stream without joining bodies or carrying detector state across blobs", async () => {
  const block = Buffer.alloc(64 * 1024, 0), count = 288, tail = Buffer.from("ghp_" + "B".repeat(36));
  const hash = createHash("sha256");
  async function* input() {
    yield Buffer.from(first + " blob " + (block.length * count + tail.length) + "\n");
    for (let i = 0; i < count; i++) { hash.update(block); yield block; }
    hash.update(tail); yield tail; yield Buffer.from("\n");
    yield frame(second, Buffer.from("plain final blob"));
  }
  const result = await parseSecretBlobBatch(input(), [first, second]);
  assert.deepEqual(result.get(first), { detectorIds: ["github-token"], sha256: hash.digest("hex") });
  assert.deepEqual(result.get(second)?.detectorIds, []);
  const parts = await parseSecretBlobBatch(Readable.from([frame(first, Buffer.from("ghp_" + "C".repeat(20))),
    frame(second, Buffer.from("C".repeat(16)))]), [first, second]);
  assert.ok([...parts.values()].every(scan => !scan.detectorIds.length));
});

test("missing, reordered, non-ASCII, oversized, truncated and trailing frames never return partial proof", async () => {
  const good = frame(first, Buffer.from("ok"));
  const highBit = Buffer.from(first + " blob 0\n\n"); highBit[0] = highBit[0]! | 128;
  const invalid = [
    Buffer.from(first + " missing\n"), frame(second, Buffer.from("ok")),
    Buffer.from(first + " tree 2\nok\n"), Buffer.from(first + " blob -1\n"),
    Buffer.from(first + " blob 9007199254740992\n"), Buffer.alloc(129, 65),
    Buffer.from(first + " blob 3\nab"), Buffer.from(first + " blob 2\nok!"),
    Buffer.concat([good, Buffer.from("extra")]), highBit,
    Buffer.concat([good, frame(first, Buffer.from("wrong second identity"))]),
  ];
  for (const bytes of invalid) await assert.rejects(parseSecretBlobBatch(fragmented(bytes), bytes === invalid.at(-1) ? [first, second] : [first]));
});

function fakeGit(t: TestContext, body: string) {
  const root = mkdtempSync(join(tmpdir(), "engine-blob-batch-")), prior = process.env.PATH;
  writeFileSync(join(root, "git"), "#!" + process.execPath + "\n" + body, { mode: 0o700 });
  process.env.PATH = root + ":" + (prior ?? "");
  t.after(() => { process.env.PATH = prior; rmSync(root, { recursive: true }); });
  return root;
}

test("a nonzero batch process invalidates otherwise complete frames", { skip: process.platform === "win32" }, async t => {
  const output = frame(first, Buffer.from("ok")).toString();
  const root = fakeGit(t, "process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(" + JSON.stringify(output) + ");process.exit(7);});\n");
  await assert.rejects(scanSecretBlobBatch(root, [first]));
});

test("a stalled batch is terminated and joined without leaving its owned process", { skip: process.platform === "win32" }, async t => {
  const root = fakeGit(t, "require('node:fs').writeFileSync(process.cwd()+'/pid',String(process.pid));process.stdin.resume();setInterval(()=>{},1000);\n");
  await assert.rejects(scanSecretBlobBatch(root, [first], 1000));
  const pid = Number(readFileSync(join(root, "pid"), "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("invalid request identities and oversized batches are refused before process launch", async () => {
  await assert.rejects(scanSecretBlobBatch(".", ["not-an-object"]));
  await assert.rejects(scanSecretBlobBatch(".", Array.from({ length: 129 }, () => first)));
  await assert.rejects(scanSecretBlobBatch(".", [first], 30_001));
  assert.equal((await scanSecretBlobBatch(".", [])).size, 0);
});
