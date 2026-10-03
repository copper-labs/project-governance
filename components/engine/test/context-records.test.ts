import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical, fileDigest } from "../src/core.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { CONTEXT_RECORD_MAX_BYTES, readContextRecord, writeContextRecord } from "../src/context-records.ts";

test("context record write and read agree at their local allowance and reject invalid replacements", () => {
  const root = mkdtempSync(join(tmpdir(), "context-record-boundary-"));
  try {
    const path = join(root, "route.json"), overhead = Buffer.byteLength(canonical({ inventory: "" }) + "\n");
    const record = { inventory: "x".repeat(CONTEXT_RECORD_MAX_BYTES - overhead) };
    writeContextRecord(path, record);
    assert.equal(statSync(path).size, CONTEXT_RECORD_MAX_BYTES);
    assert.equal(readContextRecord(root, "route.json").inventory, record.inventory);
    const original = fileDigest(path);
    assert.throws(() => writeContextRecord(path, { inventory: record.inventory + "x" }), (error: unknown) => {
      assert.ok(error instanceof ContextRouteError); assert.equal(error.code, "context-record-byte-limit"); return true;
    });
    assert.equal(fileDigest(path), original, "refused writes preserve existing evidence");
    symlinkSync(path, join(root, "linked.json"));
    assert.throws(() => readContextRecord(root, "linked.json"));
    assert.throws(() => readContextRecord(root, "."));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
