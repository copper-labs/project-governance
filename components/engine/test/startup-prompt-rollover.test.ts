import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { StartupOwnerChanged, StartupTasks } from "../src/startup-tasks.ts";
import { admitNativeAfterOwnerRollover } from "../src/startup-prompt-rollover.ts";

test("a departed native owner permits prompt context without transferring its startup reader", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "governance-prompt-rollover-")));
  try {
    const registry = join(workspace, "registry.sqlite"), receipts = join(workspace, "startup.sqlite");
    writeFileSync(registry, "");
    writeFileSync(join(workspace, "other.sqlite"), "");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "same-session", turn_id: "new-turn", prompt: "Update the guide" };
    const oldHost = { provider: "codex" as const, host: hostname(), pid: 123456, fingerprint: "old-native-process" };
    const newHost = { ...oldHost, pid: 123457, fingerprint: "new-native-process" };
    const tasks = new StartupTasks(receipts);
    const prior = tasks.event("codex", event, workspace, digest("lock"));
    if (prior.action !== "reserve") throw new Error("Expected a reserved native prompt");
    const reader = { registry, token: "recorded-reader", revision: 1, directory: workspace, owner: `startup-task:${prior.taskId}` };
    tasks.bindOwner(prior.taskId, oldHost, reader);
    tasks.close();
    let absentChecks = 0;
    const options = { capture: () => newHost, absent: () => { absentChecks++; } };
    assert.equal(admitNativeAfterOwnerRollover(new Error("other"), "codex", event, workspace, registry, receipts, options), false);
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
      { ...event, hook_event_name: "SessionStart" }, workspace, registry, receipts, options), true);
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, join(workspace, "other.sqlite"), receipts, options), false);
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, { ...options, capture: () => oldHost }), false);
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, options), true);
    assert.equal(absentChecks, 2);
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, { ...options, absent: () => { throw new Error("old host alive"); } }), /old host alive/);
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host: oldHost, reader });
    after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("a live recorded startup PID blocks new-process and reused-PID prompt rollover", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "governance-prompt-rollover-live-")));
  try {
    const registry = join(workspace, "registry.sqlite"), receipts = join(workspace, "startup.sqlite");
    writeFileSync(registry, "");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "same-session", turn_id: "new-turn", prompt: "Update the guide" };
    const oldHost = { provider: "codex" as const, host: hostname(), pid: process.pid, fingerprint: "recorded-native-process" };
    const tasks = new StartupTasks(receipts);
    const prior = tasks.event("codex", event, workspace, digest("lock"));
    if (prior.action !== "reserve") throw new Error("Expected a reserved native prompt");
    const reader = { registry, token: "recorded-reader", revision: 1, directory: workspace, owner: `startup-task:${prior.taskId}` };
    tasks.bindOwner(prior.taskId, oldHost, reader);
    tasks.close();

    // The test runner PID stays present; leave absence checking on the real process enumeration path.
    for (const current of [
      { ...oldHost, pid: process.pid + 1, fingerprint: "new-native-process" },
      { ...oldHost, fingerprint: "reused-pid-new-fingerprint" },
    ]) {
      assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
        workspace, registry, receipts, { capture: () => current }), /Startup host PID remains present/);
    }
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host: oldHost, reader });
    after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
