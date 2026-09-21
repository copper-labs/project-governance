import test from "node:test";
import assert from "node:assert/strict";
import { CodexHandshake } from "../src/codex-handshake.ts";
const request = { model: "selected", effort: "high", workspace: "/workspace", prompt: "private assignment", requiredTools: [], conversationId: "session" };
const initialized = { id: 1, result: { model: "selected", reasoningEffort: "high", cwd: "/workspace", approvalPolicy: "never", sandbox: { type: "dangerFullAccess" }, thread: { id: "session" } } };
test("Codex handshake preserves explicit resume and turn settings", () => {
  const protocol = new CodexHandshake(request);
  assert.equal(protocol.initial().method, "initialize");
  const messages = protocol.response({ id: 0, result: {} });
  assert.equal(messages[1]!.method, "thread/resume");
  const turn = protocol.response(initialized)[0]!;
  assert.equal(turn.method, "turn/start");
  assert.equal((turn.params as Record<string, unknown>).effort, "high");
  protocol.response({ id: 2, result: { turn: { id: "turn" } } });
  assert.equal(protocol.turnId, "turn");
  protocol.notification({ method: "item/started", params: { threadId: "session", turnId: "turn" } });
  assert.throws(() => protocol.notification({ method: "item/started", params: { turnId: "other" } }), /unexpected turn/);
});
test("Codex handshake refuses drift, duplicate responses and model rerouting permanently", () => {
  for (const override of [{ model: "wrong" }, { cwd: "/other" }, { reasoningEffort: "low" }, { approvalPolicy: "on-request" }]) {
    const protocol = new CodexHandshake(request); protocol.response({ id: 0, result: {} });
    assert.throws(() => protocol.response({ id: 1, result: { ...initialized.result, ...override } }));
    assert.throws(() => protocol.response(initialized), /handshake failed/);
  }
  const duplicate = new CodexHandshake(request); duplicate.response({ id: 0, result: {} });
  assert.throws(() => duplicate.response({ id: 0, result: {} }), /out of order/);
  const rerouted = new CodexHandshake(request);
  assert.throws(() => rerouted.notification({ method: "model/rerouted", params: {} }), /rerouted/);
});
