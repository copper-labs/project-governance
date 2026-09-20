import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../src/store/store.ts";
import { defaultPolicy } from "../src/ops/authority.ts";
import { proposeAction, authorizeAction } from "../src/ops/actions.ts";
import { inputFingerprint, type Executor } from "../src/ops/execution.ts";
import type { BatchRequest } from "../src/model/types.ts";
export function fixture(gitRepo = true) {
    const base = resolve(".harness/tests");
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, "case-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (gitRepo) {
        git("init", "-q");
        git("config", "user.email", "test@example.invalid");
        git("config", "user.name", "Harness test");
        writeFileSync(join(root, "a.ts"), "first\n");
        writeFileSync(join(root, "b.ts"), "first\n");
        git("add", ".");
        git("commit", "-qm", "initial");
    }
    const store = new Store(join(root, ".harness", "harness.db"));
    const task = store.createTask("fixture", [{ kind: "scope", provenance: "operator", body: root }], { worktree: root });
    const req = { operation: "check" as const, scope: [root], destination: null, policyRevision: defaultPolicy().revision, targets: [root] };
    const action = authorizeAction(store, proposeAction(store, task.taskId, req), req, defaultPolicy(), root);
    const batch = { version: 1, workspace: root, timeout_seconds: 10, inputs: { mode: "declared-roots", roots: [root] }, output_roots: [], cleanup_required: false, host: "unknown", cases: [{ id: "one", argv: [process.execPath, "-e", "process.exit(0)"], timeout_seconds: 10, expected_exit_codes: [0], depends_on: [] }] };
    return { root, git, store, task, action, batch, req };
}
export class FakeExecutor implements Executor {
    executable = "fixture-owner";
    digest = "fixture-digest";
    stateRoot = "fixture-state";
    submissions = 0;
    request: BatchRequest | null = null;
    reply: Record<string, unknown> = { job_id: "job-1", ready: false, state: "running" };
    submit(request: BatchRequest) { this.submissions++; this.request = request; return { job_id: "job-1", protocol_version: 2 }; }
    result() { return this.reply; }
    wait() { }
    status() { return { job_id: "job-1", stage: "running", elapsed_seconds: 1 }; }
    cancel() { this.finish(false); this.reply["state"] = "cancelled"; return this.reply; }
    finish(passed = true) { this.reply = { job_id: "job-1", ready: true, protocol_version: 1, state: passed ? "succeeded" : "failed", kind: "test-batch", workspace: this.request!.workspace, cleanup_confirmed: true, assessment_allowed: true, input_validity: "declared-scope-only", input_binding: this.request!.inputs.mode, input_fingerprint: inputFingerprint(this.request!), started_at: 1, finished_at: 2, cases: [{ id: "one", outcome: passed ? "passed" : "failed", exit_code: passed ? 0 : 1 }] }; }
}
export function testTmpdir(): string { const path = resolve(".harness/tests/tmp"); mkdirSync(path, { recursive: true }); return path; }
