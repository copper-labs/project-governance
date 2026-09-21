import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { checkFormat } from "../src/checkers/format.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "engine-format-"));
  return { root, subject: () => new ValidationSubject(root, resolveChangeScope(root, { all: true })), close: () => rmSync(root, { recursive: true }) };
}

test("format reports whitespace only on supported text paths and preserves exact line numbers", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "doc.md"), "first  \r\nsecond\t\nclean\n");
    writeFileSync(join(f.root, "source.ts"), "outside format pack  \n");
    const result = checkFormat(f.subject(), ["doc.md", "source.ts"]);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(v => [v["path"], v["line"]]), [["doc.md", 1], ["doc.md", 2]]);
  } finally { f.close(); }
});

test("preserved notice exemptions require exact bytes and reviewable provenance", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "config/policies"), { recursive: true });
    const content = "upstream notice  \n", path = join(f.root, "LICENSE"); writeFileSync(path, content);
    const registry = { version: 1, notices: [{ path: "LICENSE", sha256: createHash("sha256").update(content).digest("hex"), source: "https://example.invalid/upstream/LICENSE" }] };
    writeFileSync(join(f.root, "config/policies/format-preserved-notices.json"), JSON.stringify(registry));
    const pass = checkFormat(f.subject(), ["LICENSE"]);
    assert.equal(pass.status, "passed"); assert.deepEqual(pass.preserved_notices, ["LICENSE"]);
    writeFileSync(path, "modified notice  \n");
    const changed = checkFormat(f.subject(), ["LICENSE"]);
    assert.equal(changed.status, "failed");
    assert.deepEqual(changed.findings.map(f => f.rule_id), ["format.preservation-invalid", "format.drift"]);
    registry.notices[0]!.source = "http://example.invalid/untrusted";
    writeFileSync(join(f.root, "config/policies/format-preserved-notices.json"), JSON.stringify(registry));
    assert.match(String(checkFormat(f.subject(), ["LICENSE"]).findings[0]!["message"]), /HTTPS/);
  } finally { f.close(); }
});

test("format checks staged bytes even when the checkout has already been repaired", () => {
  const f = fixture();
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: f.root, stdio: "ignore" });
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
    writeFileSync(join(f.root, "doc.md"), "base\n"); git("add", "."); git("commit", "-qm", "base");
    writeFileSync(join(f.root, "doc.md"), "staged drift  \n"); git("add", ".");
    writeFileSync(join(f.root, "doc.md"), "repaired but unstaged\n");
    const scope = resolveChangeScope(f.root, { staged: true });
    assert.equal(checkFormat(new ValidationSubject(f.root, scope), ["doc.md"]).status, "failed");
    assert.equal(checkFormat(f.subject(), ["doc.md"]).status, "passed");
  } finally { f.close(); }
});


test("format covers environment examples and text bin entries without parsing binaries", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "tools/bin"), { recursive: true });
    writeFileSync(join(f.root, ".env.example"), "OPTION=example  \n");
    writeFileSync(join(f.root, "tools/bin/run"), "#!/bin/sh\necho ready  \n");
    writeFileSync(join(f.root, "tools/bin/native"), Buffer.from([0, 255, 32, 32, 10]));
    const result = checkFormat(f.subject(), [".env.example", "tools/bin/run", "tools/bin/native"]);
    assert.deepEqual(result.findings.map(v => [v.path, v.line]), [[".env.example", 1], ["tools/bin/run", 2]]);
    writeFileSync(join(f.root, "tools/bin/broken.sh"), Buffer.from([255]));
    assert.throws(() => checkFormat(f.subject(), ["tools/bin/broken.sh"]), /encoded data/);
  } finally { f.close(); }
});
