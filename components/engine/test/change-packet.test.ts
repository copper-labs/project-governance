import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope } from "../src/change-subject.ts";
import { materializeChangePacket, PacketCaptureError } from "../src/change-packet.ts";
import { fileDigest } from "../src/core.ts";

test("external checker packets carry exact staged bytes and content hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "materialized-packet-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    writeFileSync(join(root, "example.txt"), "staged\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true }); writeFileSync(join(root, "example.txt"), "later\n");
    const result = materializeChangePacket(root, scope, join(root, "packet"));
    const after = result.packet.records[0]!["after_path"] as string;
    assert.equal(readFileSync(after, "utf8"), "staged\n");
    assert.equal(fileDigest(after).slice(7), result.packet.records[0]!["after_sha256"]);
    assert.equal(fileDigest(result.path).slice(7), result.env["PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256"]);
    assert.throws(() => materializeChangePacket(root, { ...scope, subject_digest: "incorrect" }, join(root, "bad")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("oversized committed input fails visibly without publishing a partial packet", () => {
  const root = mkdtempSync(join(tmpdir(), "committed-packet-limit-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid"); git("commit", "--allow-empty", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "committed.zip"), Buffer.alloc(17 * 1024 * 1024)); git("add", "."); git("commit", "-qm", "candidate");
    const scope = resolveChangeScope(root, { baseRef: base, candidateRef: git("rev-parse", "HEAD") });
    const directory = join(root, "packet");
    assert.throws(() => materializeChangePacket(root, scope, directory), error => error instanceof PacketCaptureError &&
      error.capture.reason === "source-over-limit" && error.capture.source_kind === "git" && error.capture.side === "after" &&
      error.capture.size_bytes === 17 * 1024 * 1024 && error.capture.limit_bytes === 16 * 1024 * 1024);
    assert.equal(existsSync(directory), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
