import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { checkComments } from "../src/checkers/comments.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
const defaults = new URL("../../../src/project_governance_runtime/defaults/", import.meta.url);
const document = (name: string) => ({ path: `config/policies/${name}.yaml`, value: parse(readFileSync(new URL(`policies/${name}.yaml`, defaults), "utf8")), schema: JSON.parse(readFileSync(new URL(`schemas/${name}.schema.json`, defaults), "utf8")) });

test("composed comment checker proves packaged adapters and checks captured staged declarations", async () => {
  const root = mkdtempSync(join(tmpdir(), "comments-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    git("commit", "--allow-empty", "-qm", "base");
    writeFileSync(join(root, "new.py"), "def added():\n return 1\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    writeFileSync(join(root, "new.py"), "# later content\n");
    const result = await checkComments(new ValidationSubject(root, scope), scope, {
      policy: document("source-comments"), registry: document("source-comment-adapters"), waivers: document("source-comment-waivers"), today: "2026-09-20", runFixtureProof: true,
      fixture: path => { const url = new URL(`fixtures/comment-quality/${basename(path)}`, defaults); return existsSync(url) ? readFileSync(url, "utf8") : null; },
    });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(f => f.rule_id), ["SC002", "SC003", "SC005"]);
    assert.equal(result.coverage["python"], 1);
    assert.equal(result.self_test_coverage?.["python"], 5);
    assert.ok((result.self_test_coverage?.["kotlin"] ?? 0) > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
