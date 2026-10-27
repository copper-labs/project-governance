import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, openSync, closeSync, ftruncateSync, symlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { materializeChangePacket } from "../src/change-packet.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "committed-push-subject-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  for (const [path, content] of Object.entries({ "code.ts": "base\n", "unchanged.txt": "required base\n", "removed.txt": "required old\n" })) writeFileSync(join(root, path), content);
  git("add", "."); git("commit", "-qm", "base");
  return { root, git, base: git("rev-parse", "HEAD"), close: () => rmSync(root, { recursive: true, force: true }) };
}

test("pushed packet uses committed bytes and excludes a preserved 79 MiB untracked archive", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "code.ts"), "committed\n"); f.git("add", "code.ts"); f.git("commit", "-qm", "candidate");
    const candidate = f.git("rev-parse", "HEAD");
    writeFileSync(join(f.root, "code.ts"), "staged elsewhere\n"); f.git("add", "code.ts");
    writeFileSync(join(f.root, "code.ts"), "unstaged elsewhere\n");
    const archive = join(f.root, "vendor.zip"), fd = openSync(archive, "wx"); ftruncateSync(fd, 82_845_111); closeSync(fd);
    const scope = resolveChangeScope(f.root, { baseRef: f.base, candidateRef: candidate });
    assert.deepEqual(scope.records.map(record => record.path), ["code.ts"]);
    assert.equal(scope.candidate_ref, candidate);
    const packet = materializeChangePacket(f.root, scope, join(f.root, "packet"));
    assert.equal(readFileSync(packet.packet.records[0]!["after_path"] as string, "utf8"), "committed\n");
    assert.equal(new ValidationSubject(f.root, scope).read("unchanged.txt").toString(), "required base\n");
    assert.equal(f.git("status", "--short", "--", "vendor.zip"), "?? vendor.zip");
    assert.equal(readFileSync(archive).length, 82_845_111);
  } finally { f.close(); }
});

test("committed deletion, rename and symlink cannot be replaced by opposing live inputs", () => {
  const f = fixture();
  try {
    rmSync(join(f.root, "removed.txt")); renameSync(join(f.root, "code.ts"), join(f.root, "renamed.ts"));
    symlinkSync("/outside/never-read", join(f.root, "pointer")); f.git("add", "."); f.git("commit", "-qm", "candidate");
    const candidate = f.git("rev-parse", "HEAD");
    writeFileSync(join(f.root, "removed.txt"), "restored locally\n"); writeFileSync(join(f.root, "untracked-required.yaml"), "live\n");
    const scope = resolveChangeScope(f.root, { baseRef: f.base, candidateRef: candidate }), subject = new ValidationSubject(f.root, scope);
    assert.equal(subject.source("removed.txt"), null); assert.equal(subject.source("code.ts"), null);
    assert.equal(subject.source("untracked-required.yaml"), null);
    assert.equal(subject.read("renamed.ts").toString(), "base\n");
    assert.equal(scope.records.find(record => record.path === "renamed.ts")?.previous_path, "code.ts");
    const packet = materializeChangePacket(f.root, scope, join(f.root, "packet"));
    const link = packet.packet.records.find(record => record["path"] === "pointer")!;
    assert.equal(link["after_file_type"], "symlink"); assert.equal(readFileSync(link["after_path"] as string, "utf8"), "/outside/never-read");
  } finally { f.close(); }
});

test("an exact candidate distinct from HEAD stays pinned and invalid or conflicting candidates refuse", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "code.ts"), "candidate\n"); f.git("add", "."); f.git("commit", "-qm", "candidate"); const candidate = f.git("rev-parse", "HEAD");
    writeFileSync(join(f.root, "code.ts"), "later HEAD\n"); f.git("add", "."); f.git("commit", "-qm", "later");
    const scope = resolveChangeScope(f.root, { baseRef: f.base, candidateRef: candidate });
    const subject = new ValidationSubject(f.root, scope);
    assert.equal(subject.read("code.ts").toString(), "candidate\n");
    assert.match(subject.hunks("code.ts"), /\+candidate/u); assert.doesNotMatch(subject.hunks("code.ts"), /later HEAD/u);
    assert.throws(() => resolveChangeScope(f.root, { baseRef: f.base, candidateRef: "HEAD" }));
    assert.throws(() => resolveChangeScope(f.root, { baseRef: f.base, candidateRef: "0".repeat(40) }));
    for (const options of [{ all: true }, { staged: true }, { paths: ["code.ts"] }]) assert.throws(() => resolveChangeScope(f.root, { ...options, baseRef: f.base, candidateRef: candidate }));
  } finally { f.close(); }
});
