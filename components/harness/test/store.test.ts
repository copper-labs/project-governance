import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store/store.ts";
import { ExecutionStateUnavailable, RevisionConflict, type TaskItem } from "../src/model/types.ts";
const newStore = () => new Store(":memory:");
test("a revision carries unrevoked constraints forward", () => {
    const s = newStore();
    const t = s.createTask("fix the failing check", [
        { kind: "constraint", provenance: "operator", body: "do not change code" },
    ]);
    const t2 = s.reviseTask(t.taskId, [
        { kind: "open-question", provenance: "hypothesis", body: "possibly a stale cache" },
    ]);
    assert.equal(t2.version, 2);
    assert.equal(t2.supersedes, 1);
    const constraint = t2.items.find((i) => i.kind === "constraint");
    assert.ok(constraint && !constraint.revoked, "constraint survives the revision");
    s.close();
});
test("revoking a constraint is explicit and never a side effect", () => {
    const s = newStore();
    const t = s.createTask("investigate", [
        { kind: "constraint", provenance: "operator", body: "do not change code" },
    ]);
    const kept = s.reviseTask(t.taskId, []);
    assert.equal(kept.items[0]?.revoked, false, "an ordinary revision revokes nothing");
    const dropped = s.reviseTask(t.taskId, [], { revoke: [0], authorityRef: "host:correction" });
    assert.equal(dropped.items[0]?.revoked, true, "revoking is an explicit act");
    s.close();
});
test("provenance kinds are preserved, not merged", () => {
    const s = newStore();
    const t = s.createTask("o", [
        { kind: "constraint", provenance: "operator", body: "operator says" },
        { kind: "open-question", provenance: "hypothesis", body: "model guesses" },
        { kind: "handoff", provenance: "observed", body: "tool saw" },
    ]);
    assert.deepEqual(t.items.map((i) => i.provenance), ["operator", "hypothesis", "observed"]);
    s.close();
});
test("two callers racing a transition: the second does not act", () => {
    const s = newStore();
    const t = s.createTask("o", []);
    const a = s.insertAction({
        actionId: "a1", taskId: t.taskId, taskVersion: 1, operation: "read", scope: ["/tmp"],
        destination: null, policyRevision: "p1", status: "proposed",
        expectedInputs: [], intendedOutputs: [], reconcile: null, refusedReason: null,
    });
    const first = s.transitionAction(a.actionId, a.revision, "authorized");
    assert.equal(first.revision, a.revision + 1);
    assert.throws(() => s.transitionAction(a.actionId, a.revision, "authorized"), (err: unknown) => err instanceof RevisionConflict, "the stale expected revision is refused");
    assert.equal(s.readAction("a1")?.status, "authorized", "one transition, not two");
    s.close();
});
test("analytics loss never blocks; execution-critical loss is raised", () => {
    const s = newStore();
    const t = s.createTask("o", []);
    const base = {
        taskId: t.taskId, actionId: null, artifactId: null,
        claim: "c", observed: "o", establishes: "e", confirmation: "confirmed" as const,
    };
    assert.ok(s.recordEvidence({ ...base, criticality: "analytics" }));
    assert.ok(s.recordEvidence({ ...base, criticality: "execution" }));
    s.close();
    // A closed store cannot persist: analytics degrades, execution-critical refuses.
    assert.equal(s.recordEvidence({ ...base, criticality: "analytics" }), null);
    assert.throws(() => s.recordEvidence({ ...base, criticality: "execution" }), (err: unknown) => err instanceof ExecutionStateUnavailable);
});
test("usage is instrumented and totals are readable", () => {
    const s = newStore();
    const t = s.createTask("o", []);
    s.recordUsage({ taskId: t.taskId, actionId: null, kind: "execution", inputTokens: null, outputTokens: null, durationMs: 1200, costMicros: null });
    s.recordUsage({ taskId: t.taskId, actionId: null, kind: "provider", inputTokens: 581, outputTokens: 0, durationMs: 139, costMicros: 24 });
    const totals = s.usageTotals(t.taskId);
    assert.equal(totals.calls, 2);
    assert.equal(totals.inputTokens, 581);
    assert.equal(totals.durationMs, 1339);
    s.close();
});
test("JSON export is readable and complete", () => {
    const s = newStore();
    const t = s.createTask("export me", [{ kind: "scope", provenance: "operator", body: "/tmp" }]);
    const dump = s.exportJson();
    assert.equal(dump["schemaVersion"], 6);
    assert.equal((dump["task"] as unknown[]).length, 1);
    assert.equal((dump["task_item"] as unknown[]).length, 1);
    assert.ok(JSON.stringify(dump).includes(t.taskId));
    s.close();
});
test("a fork inherits constraints and ruled-out findings, with scope rewritten", () => {
    const s = newStore();
    const parent = s.createTask("add bulk export", [
        { kind: "constraint", provenance: "operator", body: "use the job queue" },
        { kind: "scope", provenance: "operator", body: "/repo/main" },
    ], { worktree: "/repo/main", branch: "master" });
    s.reviseTask(parent.taskId, [
        { kind: "ruled-out", provenance: "observed", body: "streaming CSV: the app queues bulk work" },
        { kind: "handoff", provenance: "observed", body: "session-specific chatter" },
    ]);
    const child = s.forkTask(parent.taskId, { worktree: "/repo/feature", branch: "feature" });
    const bodies = child.items.map((i) => `${i.kind}:${i.body}`);
    assert.ok(bodies.includes("constraint:use the job queue"), "constraints carry");
    assert.ok(bodies.includes("ruled-out:streaming CSV: the app queues bulk work"), "dead ends carry");
    assert.ok(bodies.includes("scope:/repo/feature"), "scope points at the forking worktree");
    assert.ok(bodies.some((b) => b.includes("session-specific")), "attributed handoff context carries");
    assert.equal(child.parentVersion, 2);
    assert.equal(child.parentTask, parent.taskId);
    assert.notEqual(child.taskId, parent.taskId, "a fork is a separate job");
    s.close();
});
test("two sessions are distinguishable in one shared store", () => {
    const s = newStore();
    const a = s.createTask("job A", [], { worktree: "/repo/main", branch: "master", session: "thread-1" });
    const b = s.createTask("job B", [], { worktree: "/repo/feature", branch: "feature", session: "thread-2" });
    assert.equal(s.readTask(a.taskId)?.session, "thread-1");
    assert.equal(s.readTask(b.taskId)?.branch, "feature");
    assert.equal(s.listTasks().length, 2, "one store holds both worktrees' jobs");
    s.close();
});

test("exact task revision provenance survives unrelated events and refuses ambiguity", () => {
    const s = newStore();
    try {
        const task = s.createTask("Finish the accepted slice", []);
        for (let i = 0; i < 120; i++) s.appendEvent(task.taskId, "observation", { i });
        s.reviseTask(task.taskId, [], { status: "accepted", authorityRef: "operator:accepted-exact-slice" });
        const event = s.taskRevisionEvent(task.taskId, 2)!;
        const detail = event.detail as Record<string, unknown>;
        assert.equal(event.taskId, task.taskId);
        assert.equal(event.kind, "task-revision");
        assert.equal(detail.authorityRef, "operator:accepted-exact-slice");
        assert.equal(detail.version, 2);
        assert.equal(s.taskRevisionEvent(task.taskId, 3), null);
        assert.throws(() => s.taskRevisionEvent(task.taskId, 0), /invalid task revision/);
        s.appendEvent(task.taskId, "task-revision", { version: 2, status: "accepted", authorityRef: "other" });
        assert.throws(() => s.taskRevisionEvent(task.taskId, 2), /ambiguous task revision provenance/);
    } finally { s.close(); }
});


test("read-only authority inspection neither creates a missing store nor permits writes", async () => {
    const { mkdtempSync, rmSync, readFileSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os"), { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "readonly-store-")), path = join(root, "store.sqlite");
    try {
        assert.throws(() => new Store(path, { readOnly: true })); assert.equal(existsSync(path), false);
        const writer = new Store(path), task = writer.createTask("Inspect existing authority", []); writer.close();
        const bytes = readFileSync(path), reader = new Store(path, { readOnly: true });
        assert.equal(reader.readTask(task.taskId)?.outcome, task.outcome);
        assert.throws(() => reader.createTask("No writes", [])); reader.close();
        assert.deepEqual(readFileSync(path), bytes);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

const planItem = (batch = "F1"): Omit<TaskItem, "seq" | "revoked"> => ({ kind: "plan-reference", provenance: "operator",
    body: JSON.stringify({ version: 1, path: "docs/exec-plans/active/example.md", batch, definition_digest: `sha256:${"a".repeat(64)}` }) });

test("plan replacement is versioned, explicit, and validates the final active set", () => {
    const s = newStore();
    try {
        assert.throws(() => s.createTask("duplicate", [planItem(), planItem("F2")]), /one active plan reference/);
        assert.equal(s.listTasks().length, 0);
        const original = s.createTask("linked", [planItem()]);
        const carried = s.reviseTask(original.taskId, [], { expectedVersion: 1 });
        assert.equal(carried.items[0]!.body, original.items[0]!.body);
        assert.throws(() => s.reviseTask(original.taskId, [planItem("F2")], { expectedVersion: 2 }), /one active plan reference/);
        assert.equal(s.readTask(original.taskId)!.version, 2, "refusal writes no new revision");
        assert.throws(() => s.reviseTask(original.taskId, [planItem("F2")], { expectedVersion: 2, revoke: [0] }), /authority reference/);
        const replaced = s.reviseTask(original.taskId, [planItem("F2")], { expectedVersion: 2, revoke: [0], authorityRef: "host:change-batch" });
        assert.equal(replaced.version, 3);
        assert.equal(replaced.items[0]!.revoked, true);
        assert.equal(JSON.parse(replaced.items[1]!.body).batch, "F2");
        assert.equal(s.readTask(original.taskId, 1)!.items[0]!.revoked, false, "old revisions retain their original association");
        assert.throws(() => s.reviseTask(original.taskId, [planItem("F3")], { expectedVersion: 2, revoke: [1], authorityRef: "host:stale" }), RevisionConflict);
        assert.equal(s.readTask(original.taskId)!.version, 3);
        const malformed = { ...planItem(), body: JSON.stringify({ version: 1, path: "../other.md", batch: "F1", definition_digest: `sha256:${"a".repeat(64)}` }) };
        assert.throws(() => s.reviseTask(original.taskId, [malformed], { expectedVersion: 3, revoke: [1], authorityRef: "host:invalid" }), /safe structured-plan path/);
        assert.equal(s.readTask(original.taskId)!.version, 3);
    } finally { s.close(); }
});

test("forks choose their own plan while retaining exact parent history", () => {
    const s = newStore();
    try {
        const parent = s.createTask("linked", [planItem(), { kind: "constraint", provenance: "operator", body: "preserve behavior" }], { worktree: "/repo/main" });
        for (const worktree of ["/repo/main", "/repo/child"]) {
            const child = s.forkTask(parent.taskId, { worktree });
            assert.equal(child.items.some(item => item.kind === "plan-reference"), false);
            assert.equal(child.parentTask, parent.taskId);
            assert.equal(child.parentVersion, 1);
            assert.equal(child.items[0]!.origin, `${parent.taskId}@1`);
            assert.equal(s.readTask(child.parentTask!, child.parentVersion!)!.items[0]!.body, parent.items[0]!.body);
            const associated = s.reviseTask(child.taskId, [planItem("F2")], { expectedVersion: 1 });
            assert.equal(associated.items.filter(item => item.kind === "plan-reference" && !item.revoked).length, 1);
        }
    } finally { s.close(); }
});

test("bounded task readers return recent records without mixing tasks or changing default history", () => {
    const s = newStore();
    try {
        const task = s.createTask("bounded observations", []), other = s.createTask("other", []);
        const evidenceIds: string[] = [];
        for (let index = 0; index < 4; index++) {
            s.insertAction({ actionId: `bounded-${index}`, taskId: task.taskId, taskVersion: 1, operation: "read", scope: ["/tmp"],
                destination: null, policyRevision: "p1", status: "proposed", expectedInputs: [], intendedOutputs: [], reconcile: null, refusedReason: null });
            evidenceIds.push(s.recordEvidence({ taskId: task.taskId, actionId: null, artifactId: null, claim: `claim-${index}`,
                observed: "recorded", establishes: "historical observation", confirmation: "unconfirmed", criticality: "execution" })!.evidenceId);
        }
        s.insertAction({ actionId: "other-action", taskId: other.taskId, taskVersion: 1, operation: "read", scope: ["/tmp"],
            destination: null, policyRevision: "p1", status: "proposed", expectedInputs: [], intendedOutputs: [], reconcile: null, refusedReason: null });
        s.recordEvidence({ taskId: other.taskId, actionId: null, artifactId: null, claim: "other", observed: "recorded",
            establishes: "other task", confirmation: "unconfirmed", criticality: "execution" });
        const cursor = s.latestCursor(task.taskId);
        assert.deepEqual(s.listActions(task.taskId).map(action => action.actionId), ["bounded-0", "bounded-1", "bounded-2", "bounded-3"]);
        assert.deepEqual(s.listActions(task.taskId, 2).map(action => action.actionId), ["bounded-3", "bounded-2"]);
        assert.deepEqual(s.listEvidence(task.taskId).map(evidence => evidence.evidenceId), evidenceIds);
        assert.deepEqual(s.listEvidence(task.taskId, 2).map(evidence => evidence.evidenceId), evidenceIds.slice(-2).reverse());
        assert.equal(s.latestCursor(task.taskId), cursor);
        for (const limit of [0, -1, 1001, 1.5, NaN]) {
            assert.throws(() => s.listActions(task.taskId, limit), /read limit/);
            assert.throws(() => s.listEvidence(task.taskId, limit), /read limit/);
        }
    } finally { s.close(); }
});
