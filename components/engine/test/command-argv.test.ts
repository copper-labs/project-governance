import { test } from "node:test";
import assert from "node:assert/strict";
import { commandTokens, resolveCommandArgv } from "../src/command-argv.ts";

test("command declarations preserve quoting and literal shell characters without expansion", () => {
  assert.deepEqual(commandTokens('node "a b.js" \'literal $HOME\' "" a\\ b'), ["node", "a b.js", "literal $HOME", "", "a b"]);
  assert.deepEqual(commandTokens('echo "x\\$HOME"'), ["echo", "x\\$HOME"]);
  assert.deepEqual(resolveCommandArgv({ run: ["tool", "{pr_title}", "prefix-{stage}", "$(touch nope)"] }, { stage: "pre-pr", pr_title: "A title with spaces" }), ["tool", "A title with spaces", "prefix-{stage}", "$(touch nope)"]);
  assert.throws(() => commandTokens("tool 'unterminated"));
  assert.throws(() => resolveCommandArgv(["tool", "{missing}"], { stage: "pre-pr" }));
  assert.throws(() => resolveCommandArgv(["tool", "{pr_title}"], { stage: "pre-pr" }));
  assert.throws(() => resolveCommandArgv({ run: ["tool"], shell: true }, { stage: "pre-pr" }));
  assert.throws(() => resolveCommandArgv([], { stage: "pre-pr" }));
});
