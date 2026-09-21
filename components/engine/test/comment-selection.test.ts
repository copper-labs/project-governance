import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { selectCommentSources } from "../src/checkers/comment-selection.ts";

test("comment selection preserves full-inventory debt and ratchets new staged sources", () => {
  const root = mkdtempSync(join(tmpdir(), "comment-selection-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    mkdirSync(join(root, "src")); writeFileSync(join(root, "src/existing.py"), "def existing():\n return 1\n"); git("add", "."); git("commit", "-qm", "base");
    const all = resolveChangeScope(root, { all: true });
    assert.equal(selectCommentSources(new ValidationSubject(root, all), all, {})[0]?.enforceAll, false);
    writeFileSync(join(root, "src/new.py"), "def added():\n return 1\n");
    writeFileSync(join(root, "src/test_new.py"), "def test_added():\n assert True\n"); git("add", ".");
    const staged = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, staged);
    const selected = selectCommentSources(subject, staged, { source_roots: ["src"], test_globs: ["*/test_*.py"], test_scope: "advisory" });
    assert.equal(selected.length, 2); assert.ok(selected.every(item => item.enforceAll));
    assert.equal(selected.find(item => item.path.endsWith("test_new.py"))?.advisoryOnly, true);
    assert.equal(selectCommentSources(subject, staged, { test_globs: ["*/test_*.py"] }).length, 1);
    assert.throws(() => selectCommentSources(subject, staged, { mode: "enforce-all" }), /all-mode/u);
    assert.throws(() => selectCommentSources(subject, staged, { source_roots: ["missing"] }), /source root/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
