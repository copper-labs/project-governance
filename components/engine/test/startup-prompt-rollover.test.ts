import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { digest } from "../src/core.ts";
import { StartupOwnerChanged, StartupTasks } from "../src/startup-tasks.ts";
import { admitNativeAfterOwnerRollover, nativeOwnerRolloverResult, PROMPT_RUNTIME_LOCK_MESSAGE } from "../src/startup-prompt-rollover.ts";
import { RUNTIME_MAINTENANCE_MESSAGE } from "../src/runtime-generations.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { contextStateRoot } from "../src/context-command.ts";

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
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, join(workspace, "other.sqlite"), receipts, options), (error: any) => error.code === "startup-registry-mismatch");
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, { ...options, capture: () => oldHost }), (error: any) => error.code === "startup-owner-unchanged");
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, { ...options, capture: () => null }), (error: any) => error.code === "native-owner-unavailable");
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, { ...options, capture: () => ({ ...newHost, host: "different-host" }) }),
      (error: any) => error.code === "native-owner-host-mismatch");
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, options), true);
    assert.equal(absentChecks, 1);
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
      { ...event, hook_event_name: "SessionStart" }, workspace, registry, receipts,
      { ...options, absent: () => { throw new Error("old host alive"); } }), /old host alive/);
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host: oldHost, reader });
    after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("a live recorded startup PID blocks SessionStart rollover including PID reuse", () => {
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
      assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", { ...event, hook_event_name: "SessionStart" },
        workspace, registry, receipts, { capture: () => current }), /Startup host PID remains present/);
    }
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host: oldHost, reader });
    after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("a verified new native parent can prepare advisory prompt context while the prior host stays live", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "prompt-live-owner-")));
  try {
    const registry = join(workspace, "registry.sqlite"), receipts = join(workspace, "startup.sqlite");
    writeFileSync(registry, "");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "continued-session", turn_id: "later-turn", cwd: workspace };
    const host = { provider: "codex" as const, host: hostname(), pid: process.pid, fingerprint: "prior-host" };
    const tasks = new StartupTasks(receipts), prior = tasks.event("codex", event, workspace, digest("lock"));
    if (prior.action !== "reserve") throw new Error("Expected reservation");
    const reader = { registry, token: "kept-reader", revision: 1, directory: workspace, owner: `startup-task:${prior.taskId}` };
    tasks.bindOwner(prior.taskId, host, reader); tasks.close();
    const options = { capture: () => ({ ...host, pid: process.pid + 1, fingerprint: "current-host" }) };
    assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex", event,
      workspace, registry, receipts, options), true);
    assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
      { ...event, hook_event_name: "SessionStart" }, workspace, registry, receipts, options), /PID remains present/);
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host, reader }); after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("lifecycle refusals retain their safe originating code and native identity without exception text", async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "prompt-cause-"))), state = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(workspace, "state");
  try {
    const event = { hook_event_name: "UserPromptSubmit", session_id: "private-session", turn_id: "private-turn", prompt: "PRIVATE PROMPT" };
    const output = await nativeOwnerRolloverResult(new ContextRouteError("runtime-maintenance", "PRIVATE EXCEPTION"),
      "codex", event, workspace, join(workspace, "registry.sqlite"), join(workspace, "startup.sqlite"));
    const directory = join(contextStateRoot(workspace), "entry-failures"), path = join(directory, readdirSync(directory)[0]!);
    const bytes = readFileSync(path, "utf8"), receipt = JSON.parse(bytes);
    assert.equal(receipt.diagnostic.stage, "startup-observation");
    assert.equal(receipt.diagnostic.causeCode, "runtime-maintenance");
    assert.equal(receipt.diagnostic.sessionDigest, digest(event.session_id));
    assert.equal(receipt.diagnostic.turnDigest, digest(event.turn_id));
    assert.ok(JSON.stringify(output).includes(path));
    for (const privateText of [event.prompt, event.session_id, event.turn_id, "PRIVATE EXCEPTION"])
      assert.ok(!bytes.includes(privateText));
  } finally {
    if (state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = state;
    rmSync(workspace, { recursive: true, force: true });
  }
});

for (const [message, cause] of [
  [RUNTIME_MAINTENANCE_MESSAGE, "runtime-maintenance"],
  [PROMPT_RUNTIME_LOCK_MESSAGE, "runtime-lock-mismatch"],
  ["Installed runtime payload differs from staging receipt", "runtime-payload-mismatch"],
  ["PRIVATE UNKNOWN EXCEPTION", "lifecycle-cause-unclassified"],
] as const) test(`plain lifecycle errors record ${cause} without exposing their message`, async () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "prompt-plain-error-"))), state = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(workspace, "state");
  try {
    await nativeOwnerRolloverResult(new Error(message), "codex",
      { hook_event_name: "UserPromptSubmit", session_id: "private-session", turn_id: "private-turn" },
      workspace, join(workspace, "registry.sqlite"), join(workspace, "startup.sqlite"));
    const directory = join(contextStateRoot(workspace), "entry-failures");
    const bytes = readFileSync(join(directory, readdirSync(directory)[0]!), "utf8");
    assert.equal(JSON.parse(bytes).diagnostic.causeCode, cause);
    assert.ok(!bytes.includes(message));
  } finally {
    if (state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = state;
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("submitted prompts refuse a foreign reservation, invalid stored owner and non-native event", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "prompt-owner-refusal-")));
  try {
    const registry = join(workspace, "registry.sqlite"), receipts = join(workspace, "startup.sqlite");
    writeFileSync(registry, "");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "same-session", turn_id: "turn" };
    const host = { provider: "codex" as const, host: hostname(), pid: process.pid, fingerprint: "prior-host" };
    const tasks = new StartupTasks(receipts), prior = tasks.event("codex", event, workspace, digest("lock"));
    if (prior.action !== "reserve") throw new Error("Expected reservation");
    const reader = { registry, token: "kept-reader", revision: 1, directory: workspace, owner: `startup-task:${prior.taskId}` };
    tasks.bindOwner(prior.taskId, host, reader); tasks.close();
    const options = { capture: () => ({ ...host, pid: process.pid + 1, fingerprint: "current-host" }) };
    // Model a mismatched/corrupt local receipt without inventing another execution workspace.
    const database = new DatabaseSync(receipts);
    try {
      database.prepare("UPDATE tasks SET root=? WHERE id=?").run(`${workspace}/foreign`, prior.taskId);
      assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
        event, workspace, registry, receipts, options), (error: any) => error.code === "startup-workspace-mismatch");
      database.prepare("UPDATE tasks SET root=? WHERE id=?").run(workspace, prior.taskId);
      database.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(JSON.stringify({ host: { ...host, pid: 0 }, reader }), prior.taskId);
      assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
        event, workspace, registry, receipts, options), (error: any) => error.code === "startup-owner-identity-invalid");
      database.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(JSON.stringify({ host, reader }), prior.taskId);
      assert.throws(() => admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"), "codex",
        { ...event, agent_id: "worker" }, workspace, registry, receipts, options), (error: any) => error.code === "native-event-unavailable");
    } finally { database.close(); }
    const after = new StartupTasks(receipts);
    assert.deepEqual(after.owner(prior.taskId), { host, reader }); after.close();
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("renamed-machine prompt rollover preserves the old reader and refuses foreign identity",()=>{
 const workspace=realpathSync(mkdtempSync(join(tmpdir(),"native-renamed-machine-")));
 try {
  const registry=join(workspace,"registry.sqlite"),receipts=join(workspace,"startup.sqlite");writeFileSync(registry,"");
  const event={hook_event_name:"UserPromptSubmit",session_id:"fixture-chat",turn_id:"later-turn"};
  const machineId="machine:sha256:"+"a".repeat(64),oldHost={provider:"codex" as const,host:"old-network-name",machineId,pid:123456,fingerprint:"old-start"};
  const current={...oldHost,host:"new-network-name.local",pid:123457,fingerprint:"new-start"};
  const tasks=new StartupTasks(receipts),prior=tasks.event("codex",event,workspace,digest("lock"));
  if(prior.action!=="reserve")throw new Error("Expected reservation");
  const reader={registry,token:"kept-reader",revision:1,directory:workspace,owner:`startup-task:${prior.taskId}`};
  tasks.bindOwner(prior.taskId,oldHost,reader);tasks.close();
  assert.equal(admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"),"codex",event,workspace,registry,receipts,{capture:()=>current}),true);
  assert.throws(()=>admitNativeAfterOwnerRollover(new StartupOwnerChanged("changed"),"codex",event,workspace,registry,receipts,{capture:()=>({...current,machineId:"machine:sha256:"+"b".repeat(64)})}),(error:any)=>error.code==="native-owner-host-mismatch");
  const after=new StartupTasks(receipts);assert.deepEqual(after.owner(prior.taskId),{host:oldHost,reader});after.close();
 }finally{rmSync(workspace,{recursive:true,force:true});}
});
