import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import { parsePushRefUpdate, readPushRefUpdate } from "../src/push-ref-input.ts";

const oid = "a".repeat(40), remote = "b".repeat(40);
const update = (candidate = oid, base = remote) => `refs/heads/topic ${candidate} refs/heads/topic ${base}\n`;

test("pre-push input handles split UTF8 framing and exact SHA1 or SHA256 endpoints", async () => {
  const bytes = Buffer.from(update().replaceAll("topic", "café"));
  assert.deepEqual(await readPushRefUpdate(Readable.from([...bytes].map(byte => Buffer.from([byte])))), { candidate: oid, remote });
  assert.deepEqual(parsePushRefUpdate(Buffer.from(update(oid, "0".repeat(40)))), { candidate: oid, remote: null });
  assert.deepEqual(parsePushRefUpdate(Buffer.from(update("a".repeat(64), "b".repeat(64)))), { candidate: "a".repeat(64), remote: "b".repeat(64) });
});

test("pre-push input rejects empty, multiple, deletion and malformed updates", () => {
  for (const value of ["", update() + update(), update() + "\n", update("0".repeat(40)), update("a".repeat(7)), update(oid, "b".repeat(64)), "private remote token"]) {
    assert.throws(() => parsePushRefUpdate(Buffer.from(value)), error => {
      assert.ok(error instanceof Error); assert.ok(!error.message.includes("private remote token")); return true;
    });
  }
  assert.throws(() => parsePushRefUpdate(Buffer.from([0xff])), /malformed/);
});

test("pre-push input bounds bytes, waiting and premature stream closure", async () => {
  await assert.rejects(readPushRefUpdate(Readable.from([Buffer.alloc(65537)])), /byte limit/);
  const pending = new PassThrough();
  await assert.rejects(readPushRefUpdate(pending, 15), /deadline/);
  const closed = new PassThrough(), result = readPushRefUpdate(closed); closed.destroy();
  await assert.rejects(result, /closed before completion/);
  await assert.rejects(readPushRefUpdate(new PassThrough(), 0), /Invalid/);
});
