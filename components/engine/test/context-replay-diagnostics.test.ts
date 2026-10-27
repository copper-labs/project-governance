import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest } from "../src/core.ts";
import { promptContext } from "../src/prompt-context.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { promptEntryTaskBinding } from "../src/context-observations.ts";
import { resolveTaskContext, taskBindingReceipt } from "../src/decision-task-binding.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";

for (const scenario of ["first-bind", "revision-stale", "foreign-session"] as const) {
  test(`packet replay diagnostic joins: ${scenario}`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "replay-joins-"))), oldState = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(root, "state");
    t.after(() => { if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState; rmSync(root, { recursive: true, force: true }); });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q"); mkdirSync(join(root, "config/governance"), { recursive: true });
    for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
    writeFileSync(join(root, "parser.ts"), "export const safe = true;\n"); git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
    const session = "private-chat-name", turn = "private-turn-name", prompt = "Private operator intent must not enter diagnostics";
    const store = new Store(defaultDbPath(root));
    t.after(() => store.close());
    const task = store.createTask("Private task outcome", [], { worktree: root, session });
    const workspace = store.workspace(workContext(root).locator, root);
    if (scenario === "revision-stale") store.bind(task.taskId, session, workspace, root);
    const assets = resolve("src/project_governance_runtime/assets/skills");
    await promptContext("codex", { hook_event_name: "UserPromptSubmit", session_id: session, turn_id: turn, cwd: root, prompt }, root, { environment: {}, assetRoot: assets });
    const entries = join(contextStateRoot(root), "prompt-entries");
    const entryPath = join(entries, readdirSync(entries)[0]!);
    const original = readFileSync(entryPath, "utf8"), entry = JSON.parse(original);
    const historical = promptEntryTaskBinding(root, entry);
    if (scenario === "revision-stale") store.reviseTask(task.taskId, [], { outcome: "Private revised outcome" });
    else store.bind(task.taskId, session, workspace, root);
    const current = taskBindingReceipt(resolveTaskContext(root, { session }));
    let dispatches = 0;
    const provider = { async decide() { dispatches++; throw new Error("replay cannot dispatch"); } };
    await assert.rejects(contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: scenario === "foreign-session" ? "another-private-chat" : session }), error => {
      assert.ok(error instanceof ContextRouteError);
      assert.equal(error.code, scenario === "foreign-session" ? "entry-session-mismatch" : "entry-task-changed");
      assert.ok(error.receiptPath);
      const raw = readFileSync(error.receiptPath, "utf8"), receipt = JSON.parse(raw);
      assert.equal(receipt.providerCalled, false);
      for (const secret of [session, turn, prompt, task.taskId, "Private task outcome", "Private revised outcome", root]) assert.ok(!raw.includes(secret));
      if (scenario === "foreign-session") assert.equal(receipt.diagnostic, undefined);
      else {
        assert.deepEqual(receipt.diagnostic, {
          stage: "packet-replay", causeCode: "entry-task-binding-changed", referenceDigest: digest(entry.entryId), referenceBytes: 64,
          sessionDigest: digest(session), turnDigest: digest(turn), workspaceDigest: digest(root),
          historicalBindingDigest: digest(historical), currentBindingDigest: digest(current),
          historicalBindingStatus: historical?.status ?? "unbound", currentBindingStatus: current.status,
        });
        assert.notEqual(receipt.diagnostic.historicalBindingDigest, receipt.diagnostic.currentBindingDigest);
      }
      return true;
    });
    assert.equal(dispatches, 0);
    assert.equal(readFileSync(entryPath, "utf8"), original);
  });
}
