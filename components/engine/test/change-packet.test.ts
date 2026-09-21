import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope } from "../src/change-subject.ts";
import { materializeChangePacket } from "../src/change-packet.ts";
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
