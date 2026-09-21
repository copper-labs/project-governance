import test from "node:test";
import assert from "node:assert/strict";
import { ClaudeStream } from "../src/claude-stream.ts";
const init = { type: "system", subtype: "init", session_id: "session", model: "requested", effort: "high", permissionMode: "bypassPermissions" };
const completion = { outcome: "completed", answer: "done", artifacts: [], sources: [], checks: [], remaining: [] };
const terminal = { type: "result", subtype: "success", session_id: "session", structured_output: completion, usage: { input_tokens: 7 } };
function setup(requiredTools = ["command"]) {
  const events: unknown[] = [];
  return { events, stream: new ClaudeStream({ model: "requested", effort: "high", requiredTools }, event => events.push(event)) };
}
const tool = { type: "assistant", message: { model: "requested", content: [{ type: "tool_use", id: "tool-1", name: "Bash" }] } };
const result = (error: boolean, content: string) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tool-1", is_error: error, content }] } });
test("Claude stream binds tools and completion without projecting private reasoning", () => {
  const { stream, events } = setup(); stream.accept(init); stream.accept(tool);
  stream.accept({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "private-content" } } });
  stream.accept(result(false, "output")); stream.accept(terminal);
  assert.equal(stream.finish().state, "succeeded");
  assert.deepEqual(stream.finish().usage, { usage: { input_tokens: 7 }, models: null, estimated_cost_usd: null });
  assert.equal(JSON.stringify(events).includes("private-content"), false);
  assert.throws(() => stream.accept(terminal), /terminal/);
});
test("Claude identity failure poisons the stream and missing native evidence blocks completion", () => {
  const { stream } = setup(); assert.throws(() => stream.accept({ ...init, model: "different" }), /different model/);
  assert.throws(() => stream.accept(init), /terminal/); assert.throws(() => stream.finish(), /failed validation/);
  const missing = setup().stream; missing.accept(init); missing.accept(terminal); assert.equal(missing.finish().state, "blocked");
  const unknown = setup().stream; unknown.accept(init); assert.throws(() => unknown.accept(result(false, "ok")), /unknown tool/);
});
test("Claude denied operations block completion until the same operation recovers", () => {
  for (const recovered of [false, true]) {
    const { stream } = setup([]); stream.accept(init); stream.accept(tool); stream.accept(result(true, "Permission denied"));
    if (recovered) stream.accept(result(false, "ok"));
    stream.accept(terminal); assert.equal(stream.finish().state, recovered ? "succeeded" : "blocked");
  }
});
