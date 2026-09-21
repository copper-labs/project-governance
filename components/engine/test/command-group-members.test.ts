import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectCommandGroup } from "../src/command-group-members.ts";
import { commandProcesses } from "../src/command-owner-recovery.ts";

test("a mismatched recorded identity cannot adopt current process-group members", () => {
  const root = mkdtempSync(join(tmpdir(), "guardian-identity-"));
  try {
    const group = commandProcesses().find(row => row.pid === process.pid)!.group;
    const known = new Map([[process.pid, "different-process-start"]]);
    assert.deepEqual(collectCommandGroup(root, "fixture", group, known), []);
    assert.equal(known.size, 1);
    const evidence = JSON.parse(readFileSync(join(root, "group-members.json"), "utf8"));
    assert.deepEqual(evidence.members, [{ pid: process.pid, fingerprint: "different-process-start" }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
