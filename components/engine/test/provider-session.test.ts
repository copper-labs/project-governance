import test from "node:test";
import assert from "node:assert/strict";
import { ProviderSession } from "../src/provider-session.ts";
const expected = { model: "specified-model", effort: "high", permissions: "full", conversationId: "session-1", requiredTools: ["command"] };
const init = { model: expected.model, effort: expected.effort, permissions: expected.permissions, session: expected.conversationId };
const final = { outcome: "completed", answer: "done", artifacts: [], checks: [], sources: [], remaining: [] };
test("provider identity drift and premature completion cannot become successful results", () => {
  for (const override of [{ model: "other" }, { effort: "low" }, { permissions: "restricted" }, { session: "other" }]) {
    const session = new ProviderSession(expected);
    assert.throws(() => session.initialize({ ...init, ...override }));
    assert.throws(() => session.complete(final), /without verified/);
  }
  const session = new ProviderSession(expected);
  assert.throws(() => session.identity(), /not verified/);
  assert.throws(() => session.assertToolAdmission(), /before verified/);
  assert.throws(() => session.finish([], []), /without a verified terminal/);
  session.initialize(init); session.assertToolAdmission();
  assert.deepEqual(session.identity(), { conversationId: "session-1", model: "specified-model", requestedEffort: "high", reportedEffort: "high", permissions: "full" });
  assert.throws(() => session.initialize(init), /duplicate initialization/);
  assert.throws(() => session.session("new-session"), /differs/);
  assert.throws(() => session.model("other"), /different model/);
  session.complete(final);
  assert.throws(() => session.complete(final), /duplicate completion/);
  assert.throws(() => session.assertToolAdmission(), /after completion/);
  assert.equal(session.finish([], []).state, "blocked");
  assert.equal(session.finish([{ name: "Bash", category: "command", state: "DONE" }], []).state, "succeeded");
});
test("unreported effort stays unknown and completion input is captured immutably", () => {
  const session = new ProviderSession({ ...expected, requiredTools: [] });
  assert.equal(session.initialize({ ...init, effort: undefined }).effort, null);
  assert.equal(session.identity().reportedEffort, null);
  const input = { ...final, remaining: ["unfinished"] };
  session.complete(input); input.remaining.length = 0;
  assert.equal(session.finish([], []).state, "blocked");
});
