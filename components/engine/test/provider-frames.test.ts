import test from "node:test";
import assert from "node:assert/strict";
import { ProviderFrames } from "../src/provider-frames.ts";
import { ClaudeStream } from "../src/claude-stream.ts";

test("native frames survive every byte split including multibyte text", () => {
  const input = Buffer.from('\n{"text":"café 🐦"}\r\n{"done":true}\n');
  for (let split = 0; split <= input.length; split++) {
    const values: unknown[] = [], frames = new ProviderFrames(value => values.push(value));
    frames.push(input.subarray(0, split)); frames.push(input.subarray(split)); frames.end();
    assert.deepEqual(values, [{ text: "café 🐦" }, { done: true }]);
  }
});
test("malformed, truncated and oversized frames fail permanently", () => {
  for (const input of [Buffer.from('not-json\n'), Buffer.from([0xff, 10]), Buffer.from('123456789')]) {
    const frames = new ProviderFrames(() => {}, 8);
    assert.throws(() => frames.push(input)); assert.throws(() => frames.push(Buffer.from('{}\n')), /closed/);
  }
  const truncated = new ProviderFrames(() => {}); truncated.push(Buffer.from('{}')); assert.throws(() => truncated.end(), /truncated/);
  const values: unknown[] = [], combined = new ProviderFrames(value => values.push(value), 2);
  combined.push(Buffer.from('{}\n{}\n')); combined.end(); assert.equal(values.length, 2);
});
test("framed Claude completion reaches the shared native evidence gate", () => {
  const stream = new ClaudeStream({ model: "fixture", effort: "high", requiredTools: [] }, () => {});
  const frames = new ProviderFrames(event => stream.accept(event));
  const events = [{ type: "system", subtype: "init", model: "fixture", session_id: "fixture-session", permissionMode: "bypassPermissions" },
    { type: "result", subtype: "success", structured_output: { outcome: "completed", answer: "verified", artifacts: [], sources: [], checks: [], remaining: [] } }];
  for (const byte of Buffer.from(events.map(event => JSON.stringify(event) + '\n').join(''))) frames.push(Buffer.from([byte]));
  frames.end(); assert.equal(stream.finish().state, "succeeded");
});
