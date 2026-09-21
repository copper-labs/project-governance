import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { narrativeFile, narrativeInputs } from "../src/narrative-inputs.ts";
import { checkCommitMessage } from "../src/checkers/narrative.ts";

test("hook narrative reads honor Git comment configuration and reject unsafe input files", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-inputs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "core.commentChar", ";"], { cwd: root });
    writeFileSync(join(root, "message"), "Fix task resume ownership\n\n; This is generated guidance.\n");
    const inputs = narrativeInputs(root, { commitFile: "message" });
    assert.equal(inputs.commit?.commentMarker, ";");
    assert.equal(checkCommitMessage(inputs.commit!.text, "message", inputs.commit!.commentMarker).status, "failed");
    assert.throws(() => narrativeInputs(root, { prTitle: "Fix task resume ownership" }));
    symlinkSync("message", join(root, "linked")); assert.throws(() => narrativeFile(root, "linked"));
    writeFileSync(join(root, "large"), Buffer.alloc(1024 * 1024 + 1)); assert.throws(() => narrativeFile(root, "large"));
    writeFileSync(join(root, "invalid"), Buffer.from([0xff])); assert.throws(() => narrativeFile(root, "invalid"));
    assert.throws(() => narrativeFile(root, ".git"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
