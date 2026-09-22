import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { submitProviderJob, submitProviderFollowUp } from "../src/provider-job.ts";
import { submitCommand, waitCommand } from "../src/process-owner.ts";
import { reconcileCommandClaims } from "../src/command-claim-recovery.ts";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { providerJobCommand } from "../src/provider-job-command.ts";
import { providerCommand } from "../src/provider-command.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";

test("explicit provider submission and follow-up use one owner, preserve constraints and never repeat an acknowledged job", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-job-")), previousEnvironment = { ...process.env };
  process.env.XDG_STATE_HOME = join(root, "private-state");
  delete process.env.GOVERNANCE_DECISION_CONTEXT; delete process.env.HARNESS_SESSION; delete process.env.CODEX_THREAD_ID;
  try {
    const executable = join(root, "native-agent"), count = join(root, "calls");
    writeFileSync(executable, `#!${process.execPath}
const fs = require('node:fs');
let input=''; process.stdin.on('data', c=>input+=c); process.stdin.on('end',()=>{
if(!input.includes('Parent constraints: Do not publish')) process.exit(9);
fs.appendFileSync(${JSON.stringify(count)}, 'called\\n');
console.log(JSON.stringify({type:'system',subtype:'init',model:'fixture',effort:'high',session_id:'session-one',permissionMode:'bypassPermissions'}));
console.log(JSON.stringify({type:'result',subtype:'success',structured_output:{outcome:'completed',answer:'done',artifacts:[],checks:[],sources:[],remaining:[]}}));
});
`);
    chmodSync(executable, 0o700);
    const options = { id: "first", provider: "claude" as const, workspace: root, executable, model: "fixture", effort: "high",
      prompt: "Inspect fixture", assignment: { role: "reviewer", constraints: "Do not publish", context: "" },
      registry: join(root, "registry.sqlite"), deadlineMs: 3000, outputLimit: 10000 };
    const requestFile = join(root, "request.json"); writeFileSync(requestFile, JSON.stringify(options));
    const first = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("../src/cli.ts", import.meta.url)), "provider-submit", "--request", requestFile], { cwd: root, encoding: "utf8" }));
    const handleArgs = ["--directory", first.directory, "--digest", first.requestDigest];
    assert.equal((await providerJobCommand("provider-wait", [...handleArgs, "--milliseconds", "5000"])).exitCode, 0);
    const listing = (await providerJobCommand("provider-list", ["--workspace", root])).result as { jobs: Array<{ directory: string; requestDigest: string; state: string }> };
    assert.equal(listing.jobs.length, 1);
    assert.equal(listing.jobs[0]!.directory, first.directory);
    assert.equal(listing.jobs[0]!.requestDigest, first.requestDigest);
    assert.equal(listing.jobs[0]!.state, "succeeded");
    assert.ok(!JSON.stringify(listing).includes("Do not publish"));
    const status = await providerJobCommand("provider-status", handleArgs);
    assert.equal(status.exitCode, 0);
    assert.equal((status.result as { provider: { completion: { answer: string } } }).provider.completion.answer, "done");
    assert.equal((await providerJobCommand("provider-events", handleArgs)).exitCode, 0);
    await assert.rejects(() => providerJobCommand("provider-cancel", ["--directory", first.directory, "--digest", "wrong", "--authority", "parent"]), /identity mismatch/);
    await assert.rejects(() => providerJobCommand("provider-wait", [...handleArgs, "--milliseconds", "30001"]), /0..30000/);
    assert.equal((await submitProviderJob(first.directory, options)).submitted, false);
    process.env.HARNESS_SESSION = "ambient";
    const bind = (outcome: string) => {
      const store = new Store(defaultDbPath(root)), where = workContext(root);
      try {
        const task = store.createTask(outcome, [], { ...where, session: "ambient", mode: "implement" });
        store.bind(task.taskId, "ambient", store.workspace(where.locator, where.worktree), where.worktree);
        return task;
      } finally { store.close(); }
    };
    const ambient = bind("First task intent");
    assert.equal((await submitProviderJob(first.directory, options)).submitted, false);
    assert.equal(JSON.parse(readFileSync(join(first.directory, "request.json"), "utf8")).decisionBinding.task, null);
    const boundOptions = { ...options, id: "ambient-job" };
    const bound = await submitProviderJob(join(root, "ambient-job"), boundOptions);
    assert.equal((await waitCommand(bound.directory, bound.requestDigest, 5000)).receipt?.state, "succeeded");
    bind("Replacement task intent");
    assert.equal((await submitProviderJob(bound.directory, boundOptions)).submitted, false);
    assert.equal(JSON.parse(readFileSync(join(bound.directory, "request.json"), "utf8")).decisionBinding.task.taskId, ambient.taskId);
    const legacyOptions = { ...options, id: "legacy-job" }, legacyDirectory = join(root, "legacy-job");
    const legacy = submitCommand(legacyDirectory, { ...providerCommand(legacyOptions, legacyDirectory), runtime: null });
    assert.equal((await waitCommand(legacy.directory, legacy.requestDigest, 5000)).receipt?.state, "succeeded");
    assert.equal((await submitProviderJob(legacy.directory, legacyOptions)).submitted, false);
    const follow = { id: "second", prompt: "Inspect again", directory: join(root, "second") };
    const followFile = join(root, "follow.json"); writeFileSync(followFile, JSON.stringify({ id: follow.id, prompt: follow.prompt }));
    const second = (await providerJobCommand("provider-follow-up", [...handleArgs, "--request", followFile])).result as { directory: string; requestDigest: string };
    assert.equal((await waitCommand(second.directory, second.requestDigest, 5000)).receipt?.state, "succeeded");
    assert.equal(submitProviderFollowUp(first.directory, first.requestDigest, { ...follow, directory: second.directory }).submitted, false);
    const recorded = JSON.parse(readFileSync(join(second.directory, "request.json"), "utf8"));
    assert.equal(recorded.parent.requestDigest, first.requestDigest);
    assert.equal(recorded.provider.conversationId, "session-one");
    assert.equal(recorded.assignment.constraints, "Do not publish");
    assert.equal(readFileSync(count, "utf8"), "called\ncalled\ncalled\ncalled\n");
    reconcileCommandClaims(second.directory, second.requestDigest);
    const completedJobs = (await providerJobCommand("provider-list", ["--workspace", root])).result as { jobs: unknown[] };
    assert.equal(completedJobs.jobs.length, 2, "the managed list excludes explicitly placed external fixture jobs");
  } finally {
    process.env = previousEnvironment;
    rmSync(root, { recursive: true, force: true });
  }
});
