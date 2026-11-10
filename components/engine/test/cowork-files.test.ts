import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coworkFileApply, coworkFileRead } from "../src/cowork-files.ts";

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "cowork-files-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test("preflight rejects stale batch before intents or mutations", t => {
  const root = fixture(t); writeFileSync(join(root, "a.txt"), "original");
  const expected = coworkFileRead(root, "a.txt").sha256;
  assert.throws(() => coworkFileApply(root, [
    { path: "new.txt", expected: "absent", text: "new" },
    { path: "a.txt", expected: "absent", text: "overwrite" },
  ], () => assert.fail("must not record rejected batch")), /conflict/u);
  assert.equal(coworkFileRead(root, "a.txt").sha256, expected);
  assert.throws(() => coworkFileRead(root, "new.txt"), /absent/u);
});
test("explicit lockfile edit preserves executable mode and Unicode pagination", t => {
  const root = fixture(t); writeFileSync(join(root, "Cargo.lock"), "A😀Z"); chmodSync(join(root, "Cargo.lock"), 0o755);
  const page = coworkFileRead(root, "Cargo.lock", 1, 1);
  assert.equal(page.text, "😀"); assert.equal(page.next_offset, 2);
  let intents: string[] = [];
  assert.equal(coworkFileApply(root, [{ path: "Cargo.lock", expected: page.sha256, text: "updated" }], paths => { intents = paths; }).ok, true);
  assert.deepEqual(intents, ["Cargo.lock"]); assert.equal(statSync(join(root, "Cargo.lock")).mode & 0o777, 0o755);
});
test("credential, authority, traversal and symlink paths cannot be edited", t => {
  const root = fixture(t), outside = fixture(t); writeFileSync(join(outside, "secret.txt"), "private");
  symlinkSync(outside, join(root, "escape")); symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));
  for (const path of ["../secret.txt", ".env", "AGENTS.md", "config/governance/runtime.lock.yaml", ".git/config", "escape/secret.txt", "link.txt"])
    assert.throws(() => coworkFileApply(root, [{ path, expected: "absent", text: "bad" }], () => {}));
  assert.equal(readFileSync(join(outside, "secret.txt"), "utf8"), "private");
});
test("drift after preflight reports partial results without overwriting it", t => {
  const root = fixture(t); writeFileSync(join(root, "a.txt"), "old");
  const expected = coworkFileRead(root, "a.txt").sha256;
  const result = coworkFileApply(root, [
    { path: "new.txt", expected: "absent", text: "new" },
    { path: "a.txt", expected, text: "replacement" },
    { path: "later.txt", expected: "absent", text: "later" },
  ], () => writeFileSync(join(root, "a.txt"), "concurrent"));
  assert.equal(result.ok, false); assert.deepEqual(result.results.map(r => r.state), ["applied", "failed", "not-attempted"]);
  assert.equal(readFileSync(join(root, "a.txt"), "utf8"), "concurrent");
});
test("delete requires exact original and cannot silently replay", t => {
  const root = fixture(t); writeFileSync(join(root, "a.txt"), "old");
  const edit = { path: "a.txt", expected: coworkFileRead(root, "a.txt").sha256, delete: true as const };
  assert.equal(coworkFileApply(root, [edit], () => {}).ok, true);
  assert.throws(() => coworkFileApply(root, [edit], () => {}), /conflict/u);
});
test("new nested files create only checked parent directories after preflight", t => {
  const root = fixture(t);
  assert.equal(coworkFileApply(root, [{ path: "src/new/a.ts", expected: "absent", text: "export {};" }], () => {}).ok, true);
  assert.equal(coworkFileRead(root, "src/new/a.ts").text, "export {};");
  assert.throws(() => coworkFileApply(root, [
    { path: "folder", expected: "absent", text: "file" },
    { path: "folder/child", expected: "absent", text: "child" },
  ], () => assert.fail("overlap must fail before intents")), /overlapping-paths/u);
  assert.throws(() => coworkFileApply(root, [{ path: "agents.md", expected: "absent", text: "changed authority" }], () => {}), /path-denied/u);
});
