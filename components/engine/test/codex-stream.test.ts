import test from "node:test";
import assert from "node:assert/strict";
import { CodexStream } from "../src/codex-stream.ts";
const final = JSON.stringify({ outcome: "completed", answer: "done", artifacts: [], sources: [], checks: [], remaining: [] });
function initialized(requiredTools = ["command"]) {
  const stream = new CodexStream({ model: "fixture", effort: "high", workspace: "/work", prompt: "task", requiredTools }, () => {});
  stream.accept({ id: 0, result: {} });
  stream.accept({ id: 1, result: { model: "fixture", reasoningEffort: "high", cwd: "/work", approvalPolicy: "never", sandbox: { type: "dangerFullAccess" }, thread: { id: "session" } } });
  stream.accept({ id: 2, result: { turn: { id: "turn" } } }); return stream;
}
function finish(stream: CodexStream) {
  stream.accept({ method: "item/completed", params: { threadId: "session", turnId: "turn", item: { type: "agentMessage", id: "answer", text: final, phase: "final_answer" } } });
  stream.accept({ method: "turn/completed", params: { turn: { id: "turn", status: "completed" } } }); return stream.finish();
}
test("Codex completion depends on observed native tools rather than reported answer", () => {
  for (const exitCode of [0, 1]) {
    const stream = initialized();
    stream.accept({ method: "item/completed", params: { threadId: "session", turnId: "turn", item: { type: "commandExecution", id: "cmd", status: "completed", exitCode } } });
    assert.equal(finish(stream).state, exitCode === 0 ? "succeeded" : "blocked");
  }
});
test("Codex requests return refusal and interrupt messages without a successful result", () => {
  const stream = initialized([]);
  const replies = stream.accept({ id: 33, method: "item/tool/requestUserInput" });
  assert.equal(replies.length, 2); assert.equal(replies[1]!.method, "turn/interrupt");
  assert.equal(stream.stopRequested, true); assert.equal(stream.finish().state, "blocked");
});
test("Codex rejects mismatched completed turns and native model reroutes", () => {
  const stream = initialized([]);
  assert.throws(() => stream.accept({ method: "turn/completed", params: { turn: { id: "other", status: "completed" } } }), /identity differs/);
  assert.throws(() => stream.finish(), /failed validation/);
  const rerouted = initialized([]); assert.throws(() => rerouted.accept({ method: "model/rerouted", params: { toModel: "other" } }), /rerouted/);
});
