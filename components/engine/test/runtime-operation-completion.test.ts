import test from "node:test";
import assert from "node:assert/strict";
import { runtimeContextReadinessSnapshot } from "../src/runtime-operation-completion.ts";
import type { ContextReadiness } from "../src/context-doctor.ts";

const ready: ContextReadiness = { version: 1, status: "ready", selection: "off", mode: "off", provider: "not-requested", sharing: "not-requested",
  promptHook: "configured", issues: [], next: "Local retrieval remains available.", basis: "current-configuration-only",
  providerAvailability: "not-probed", hostConsumption: "not-observed" };

test("completion readiness retains a passive capture time and preserves intentional off", () => {
  let calls = 0;
  const snapshot = runtimeContextReadinessSnapshot("/fixture-workspace", workspace => {
    assert.equal(workspace, "/fixture-workspace"); calls++; return ready;
  });
  assert.equal(calls, 1); assert.equal(snapshot.status, "ready"); assert.equal(snapshot.selection, "off");
  assert.equal(snapshot.observation, "activation-completion-snapshot");
  assert.equal(Number.isFinite(Date.parse(snapshot.observedAt)), true);
  assert.deepEqual({ ...snapshot, observedAt: undefined, observation: undefined }, { ...ready, observedAt: undefined, observation: undefined });
});

test("a throwing readiness diagnostic remains unavailable without exposing private errors or blocking completion", () => {
  const snapshot = runtimeContextReadinessSnapshot("/fixture-workspace", () => { throw new Error("private diagnostic material"); });
  assert.equal(snapshot.status, "unavailable"); assert.equal(snapshot.provider, "unknown");
  assert.equal(snapshot.hostConsumption, "not-observed"); assert.equal(snapshot.providerAvailability, "not-probed");
  assert.equal(snapshot.observation, "activation-completion-snapshot"); assert.equal(Number.isFinite(Date.parse(snapshot.observedAt)), true);
  assert.deepEqual(snapshot.issues, ["context.readiness-unavailable"]);
  assert.equal(JSON.stringify(snapshot).includes("private diagnostic material"), false);
});
