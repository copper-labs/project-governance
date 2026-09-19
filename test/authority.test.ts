import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorize, defaultPolicy, withinScope } from "../src/ops/authority.ts";
import type { Task } from "../src/model/types.ts";

function fixture(): { root: string; inside: string; outside: string; link: string } {
  const root = mkdtempSync(join(tmpdir(), "harness-auth-"));
  const inside = join(root, "repo");
  const outside = join(root, "elsewhere");
  mkdirSync(inside, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(inside, "a.ts"), "ok");
  writeFileSync(join(outside, "secret.txt"), "not yours");
  const link = join(inside, "escape");
  symlinkSync(outside, link);
  return { root, inside, outside, link };
}

const task = (items: Task["items"]): Task => ({
  taskId: "t", version: 1, supersedes: null, outcome: "investigate",
  status: "open", createdAt: "", items,
  worktree: null, branch: null, parentTask: null, session: null, mode: "implement",
});

const item = (kind: Task["items"][number]["kind"], body: string) => ({
  seq: 0, kind, provenance: "operator" as const, body, revoked: false,
});

test("a target inside declared scope is allowed", () => {
  const f = fixture();
  const v = authorize(
    { operation: "read", scope: [f.inside], destination: null, policyRevision: "policy-1", targets: [join(f.inside, "a.ts")] },
    defaultPolicy(), task([]), f.root,
  );
  assert.deepEqual(v, { ok: true });
});

test("an escape through .. is refused after resolution", () => {
  const f = fixture();
  const v = authorize(
    { operation: "read", scope: [f.inside], destination: null, policyRevision: "policy-1", targets: [join(f.inside, "..", "elsewhere", "secret.txt")] },
    defaultPolicy(), task([]), f.root,
  );
  assert.equal(v.ok, false);
});

test("an escape through a symlink is refused after resolution", () => {
  const f = fixture();
  assert.equal(withinScope(join(f.link, "secret.txt"), [f.inside], f.root), false);
  const v = authorize(
    { operation: "read", scope: [f.inside], destination: null, policyRevision: "policy-1", targets: [join(f.link, "secret.txt")] },
    defaultPolicy(), task([]), f.root,
  );
  assert.equal(v.ok, false, "a symlink out of scope does not become in-scope by its path");
});

test("an action cannot claim scope the task does not hold", () => {
  const f = fixture();
  const v = authorize(
    { operation: "read", scope: [f.root], destination: null, policyRevision: "policy-1", targets: [join(f.inside, "a.ts")] },
    defaultPolicy(), task([item("scope", f.inside)]), f.root,
  );
  assert.equal(v.ok, false);
});

test("a stale policy revision is refused, never assumed permissive", () => {
  const f = fixture();
  const v = authorize(
    { operation: "read", scope: [f.inside], destination: null, policyRevision: "policy-0", targets: [join(f.inside, "a.ts")] },
    defaultPolicy("policy-1"), task([]), f.root,
  );
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /stale/);
});

test("an investigate-only constraint refuses a transmitting action at the boundary", () => {
  const f = fixture();
  const v = authorize(
    { operation: "transmit", scope: [f.inside], destination: "provider", policyRevision: "policy-1", targets: [join(f.inside, "a.ts")] },
    { ...defaultPolicy(), allowedDestinations: ["provider"] },
    task([item("constraint", "investigate this without changing code")]),
    f.root,
  );
  assert.equal(v.ok, false, "the prohibition is enforced, not merely worded");
});

test("transmit requires a declared, permitted destination", () => {
  const f = fixture();
  const noDest = authorize(
    { operation: "transmit", scope: [f.inside], destination: null, policyRevision: "policy-1", targets: [join(f.inside, "a.ts")] },
    defaultPolicy(), task([]), f.root,
  );
  assert.equal(noDest.ok, false, "a destination is never inferred");

  const notPermitted = authorize(
    { operation: "transmit", scope: [f.inside], destination: "somewhere-else", policyRevision: "policy-1", targets: [join(f.inside, "a.ts")] },
    { ...defaultPolicy(), allowedDestinations: ["provider"] },
    task([]), f.root,
  );
  assert.equal(notPermitted.ok, false);
});

test("export rules block a transmission before it leaves", () => {
  const f = fixture();
  writeFileSync(join(f.inside, ".env.local"), "JEV_TOKEN=x");
  const v = authorize(
    { operation: "transmit", scope: [f.inside], destination: "provider", policyRevision: "policy-1", targets: [join(f.inside, ".env.local")] },
    { ...defaultPolicy(), allowedDestinations: ["provider"] },
    task([]), f.root,
  );
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /export rules/);
});

test("writing to a working tree is not an operation the policy offers", () => {
  assert.equal(defaultPolicy().allowedOperations.includes("read"), true);
  assert.deepEqual(
    defaultPolicy().allowedOperations.filter((o) => String(o) === "write"),
    [],
    "the host holds the pen",
  );
});

test("a read-only constraint does not block running a declared check", () => {
  const f = fixture();
  const v = authorize(
    { operation: "check", scope: [f.inside], destination: null, policyRevision: "policy-1", targets: [f.inside] },
    defaultPolicy(),
    task([item("constraint", "investigate this without changing code")]),
    f.root,
  );
  assert.deepEqual(v, { ok: true },
    "running the suite the operator declared is not a code change");
});
