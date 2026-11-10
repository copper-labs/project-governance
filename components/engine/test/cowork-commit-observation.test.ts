import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { observeCoworkCommit, coworkLogTail } from "../src/cowork-commit-observation.ts";

test("unacknowledged commit is pending within the startup bound", t => {
  const root = mkdtempSync(join(tmpdir(), "cowork-observation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = join(root, "request.json"); writeFileSync(request, "{}");
  assert.equal(observeCoworkCommit(root, "fixture").state, "pending");
  const old = new Date(Date.now() - 120000); utimesSync(request, old, old);
  assert.equal(observeCoworkCommit(root, "fixture").state, "unknown");
});
test("optional hook output tolerates invalid UTF8 and stays bounded", t => {
  const root = mkdtempSync(join(tmpdir(), "cowork-output-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = join(root, "stderr.log");
  writeFileSync(log, Buffer.concat([Buffer.alloc(20000, 65), Buffer.from([0xff])]));
  const tail = coworkLogTail(log)!;
  assert.equal(tail.length, 16384); assert.ok(tail.endsWith("�"));
  assert.equal(coworkLogTail(root), null); assert.equal(coworkLogTail(join(root, "missing")), null);
});
