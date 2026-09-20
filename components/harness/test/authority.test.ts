import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { authorize, defaultPolicy } from "../src/ops/authority.ts";
import { authorizeAction, proposeAction, prepareAction, beginAction } from "../src/ops/actions.ts";
import { fixture } from "./helpers.ts";
test("path traversal and symlink escape are refused", () => {
    const f = fixture(), other = fixture();
    symlinkSync(other.root, join(f.root, "outside"));
    for (const target of [join(f.root, "../escape"), join(f.root, "outside/a.ts")])
        assert.equal(authorize({ ...f.req, targets: [target] }, defaultPolicy(), f.task, f.root).ok, false);
    f.store.close();
    other.store.close();
});
test("no scope and stale policy fail closed", () => { const f = fixture(); assert.equal(authorize({ ...f.req, policyRevision: "old" }, defaultPolicy(), f.task, f.root).ok, false); assert.equal(authorize(f.req, defaultPolicy(), { ...f.task, items: [] }, f.root).ok, false); f.store.close(); });
test("structured denied operation is enforced; prose is retained for host interpretation", () => { const f = fixture(); const t = f.store.reviseTask(f.task.taskId, [{ kind: "constraint", provenance: "operator", body: "deny:check" }]); assert.equal(authorize(f.req, defaultPolicy(), t, f.root).ok, false); f.store.close(); });
test("changed authorization request cannot authorize a different proposal", () => { const f = fixture(); const a = proposeAction(f.store, f.task.taskId, f.req); assert.equal(authorizeAction(f.store, a, { ...f.req, targets: [] }, defaultPolicy(), f.root).status, "refused"); f.store.close(); });
test("cancel/revise after authorization prevents dispatch", () => { const f = fixture(); const p = prepareAction(f.store, f.action, [], "owner"); f.store.reviseTask(f.task.taskId, [], { status: "cancelled" }); assert.throws(() => beginAction(f.store, p), /not open|revised/); f.store.close(); });
test("legal state transitions are enforced even with current revision", () => { const f = fixture(); assert.throws(() => f.store.transitionAction(f.action.actionId, f.action.revision, "completed"), /illegal/); f.store.close(); });
test("task expected revision and host-reported acceptance reference are explicit", () => { const f = fixture(); f.store.reviseTask(f.task.taskId, [], { expectedVersion: 1 }); assert.throws(() => f.store.reviseTask(f.task.taskId, [], { expectedVersion: 1 }), /expected revision/); assert.throws(() => f.store.reviseTask(f.task.taskId, [], { status: "accepted" }), /authority reference/); f.store.close(); });
