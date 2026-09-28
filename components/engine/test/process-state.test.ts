import test from "node:test";
import assert from "node:assert/strict";
import { processHasExited } from "../src/process-state.ts";
import { processFingerprint, processLiveFingerprint } from "../src/process-owner.ts";

test("only a fully exited process is absent from cleanup inventory", () => {
  assert.equal(processHasExited("Z"), true);
  assert.equal(processHasExited("Z+"), true);
  assert.equal(processHasExited("Zl"), false); // Linux can keep other threads alive after its leader exits.
  assert.equal(processHasExited("Zsl+"), false);
  assert.equal(processHasExited("Sl+"), false);
  assert.equal(processHasExited("?"), false); // Unknown state must not grant cleanup.
  assert.equal(processHasExited("X"), false);
});

test("identity and liveness agree for this running process", () => {
  assert.ok(processFingerprint(process.pid));
  assert.equal(processLiveFingerprint(process.pid), processFingerprint(process.pid));
});
