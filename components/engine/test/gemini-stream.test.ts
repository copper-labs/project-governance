import test from "node:test";
import assert from "node:assert/strict";
import { GeminiStream } from "../src/gemini-stream.ts";
const init = { event: "init", conversation_id: "session", init: { model: "requested", effort: "high", permission_mode: "always-proceed" } };
const completion = { outcome: "completed", answer: "done", artifacts: [], sources: [], checks: [], remaining: [] };
const terminal = { event: "result", result: { status: "SUCCESS", conversation_id: "session", structured_output: completion, usage: { input_tokens: 5 } } };
const step = (state: string, error?: string) => ({ event: "step_update", step_update: { step_type: "tool", step_index: 1, tool_name: "run_command", state, tool_info: { error } } });
const create = () => new GeminiStream({ model: "requested", effort: "high", requiredTools: ["command"] }, () => {});
test("Gemini buffers early tools until identity validation and reconciles native completion", () => {
  const stream = create(); stream.accept(step("ACTIVE")); stream.accept(init); stream.accept(step("DONE")); stream.accept(terminal);
  assert.equal(stream.finish().state, "succeeded"); assert.deepEqual(stream.finish().usage, { input_tokens: 5 });
});
test("Gemini fails identity, unbounded pre-init output and native failure without success", () => {
  const wrong = create(); assert.throws(() => wrong.accept({ ...init, init: { ...init.init, effort: "low" } }), /different reasoning effort/);
  assert.throws(() => wrong.finish(), /failed validation/);
  const buffered = create(); for (let i = 0; i < 256; i++) buffered.accept({ event: "diagnostic" });
  assert.throws(() => buffered.accept({ event: "diagnostic" }), /buffer exceeded/);
  const failed = create(); assert.throws(() => failed.accept({ event: "result", result: { status: "ERROR" } }), /native terminal failure/);
});
test("Gemini preserves unresolved denials and accepts observed recovery", () => {
  for (const recovered of [false, true]) {
    const stream = create(); stream.accept(init); stream.accept(step("ERROR", "Permission denied"));
    if (recovered) stream.accept(step("DONE"));
    stream.accept(terminal); assert.equal(stream.finish().state, recovered ? "succeeded" : "blocked");
  }
});
