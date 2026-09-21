import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveChangeScope } from "../src/change-subject.ts";
import { checkSecrets } from "../src/checkers/secret-scan.ts";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/secret-waivers.schema.json", import.meta.url), "utf8"));
const config = { waiverRegistry: { version: 1, owner: "fixture", waivers: [] }, waiverSchema: schema, today: "2026-09-20" };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "engine-secret-scan-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  writeFileSync(join(root, "config.txt"), "ordinary content\n"); git("add", "."); git("commit", "-qm", "base");
  return { root, git, close: () => rmSync(root, { recursive: true }) };
}

test("full scan detects a staged credential after worktree repair, even behind a replacement ref", async () => {
  const f = fixture();
  try {
    const original = f.git("rev-parse", "HEAD:config.txt");
    writeFileSync(join(f.root, "config.txt"), "ghp_" + "A".repeat(36)); f.git("add", "config.txt");
    const secretBlob = f.git("rev-parse", ":config.txt");
    writeFileSync(join(f.root, "config.txt"), "repaired working copy\n");
    f.git("replace", secretBlob, original);
    const result = await checkSecrets(f.root, { ...config, scope: resolveChangeScope(f.root, { all: true }) });
    assert.equal(result.status, "failed");
    assert.equal(result.findings.filter(f => f.rule_id === "security.embedded-secret").length, 1);
    assert.equal(result.findings[0]!["detector_id"], "github-token");
    assert.ok(!JSON.stringify(result).includes("A".repeat(36)));
  } finally { f.close(); }
});

test("narrow scan reads captured index bytes and refuses changed live after-images", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "config.txt"), "ghp_" + "B".repeat(36)); f.git("add", "config.txt");
    const staged = resolveChangeScope(f.root, { staged: true });
    writeFileSync(join(f.root, "config.txt"), "clean again\n");
    assert.equal((await checkSecrets(f.root, { ...config, scope: staged })).status, "failed");
    const live = resolveChangeScope(f.root, { baseRef: "HEAD" });
    writeFileSync(join(f.root, "config.txt"), "changed after scope capture\n");
    const stale = await checkSecrets(f.root, { ...config, scope: live });
    assert.ok(stale.findings.some(f => f.rule_id === "security.scan-unavailable"));
  } finally { f.close(); }
});

test("full scan streams large binary files and never follows a final symlink", async () => {
  const f = fixture();
  try {
    const large = Buffer.alloc(17 * 1024 * 1024, 0);
    Buffer.from("ghp_" + "C".repeat(36)).copy(large, large.length - 40);
    writeFileSync(join(f.root, "large.bin"), large);
    symlinkSync("/unavailable/outside", join(f.root, "link"));
    const result = await checkSecrets(f.root, { ...config, scope: resolveChangeScope(f.root, { all: true }) });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(f => [f.rule_id, f["path"]]), [["security.embedded-secret", "large.bin"]]);
  } finally { f.close(); }
});
