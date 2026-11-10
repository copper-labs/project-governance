import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCoworkRequest, readCoworkStdin } from "../src/cowork-request.ts";
const bound = { project_id: "fixture", session: "cowork:00000000-0000-0000-0000-000000000000", task_id: "task" };
test("typed requests reject hidden authority, operation mismatch and missing revision", () => {
  assert.throws(() => parseCoworkRequest("file-read", { ...bound, path: "a.ts", argv: ["sh"] }), /request-invalid/u);
  assert.throws(() => parseCoworkRequest("file-read", { ...bound, path: "a.ts", operation: "file-apply" }), /request-invalid/u);
  assert.throws(() => parseCoworkRequest("file-apply", { ...bound, edits: [{ path: "a.ts", expected: "absent", text: "new" }] }), /request-invalid/u);
  assert.doesNotThrow(() => parseCoworkRequest("file-apply", { ...bound, expected_version: 1, edits: [{ path: "a.ts", expected: "absent", text: "new" }] }));
});
test("stdin preserves private text without using argv and rejects malformed input", async () => {
  async function* stream(value: string) { yield Buffer.from(value); }
  const input = { ...bound, question: "private question", retrieval: "local", expected_version: 1 };
  assert.deepEqual(await readCoworkStdin("context", stream(JSON.stringify(input))), input);
  await assert.rejects(readCoworkStdin("context", stream("bad")), /invalid-json/u);
});
