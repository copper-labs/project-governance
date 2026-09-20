import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store/store.ts";
import { ExecutionStateUnavailable, RevisionConflict } from "../src/model/types.ts";
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
