import { test } from "node:test";
import assert from "node:assert/strict";
import { checkObservationContext } from "../src/check-observation-context.ts";

test("expected outcomes require an explicit test origin", () => {
  assert.deepEqual(checkObservationContext(), {});
  assert.deepEqual(checkObservationContext("test", "failed"), { trigger: "test", expectedStatus: "failed" });
  for (const origin of [undefined, "manual", "hook"]) assert.throws(() => checkObservationContext(origin, "failed"));
  assert.throws(() => checkObservationContext("invented"));
  assert.throws(() => checkObservationContext("test", "invented"));
});
