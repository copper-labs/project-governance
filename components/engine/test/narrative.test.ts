import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCommitMessage, checkPrDescription } from "../src/checkers/narrative.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/narrative-parity.json", import.meta.url), "utf8"));

test("commit and PR narratives preserve existing checker findings and line numbers", () => {
  for (const entry of fixture.cases) {
    const actual = entry.kind === "commit" ? checkCommitMessage(entry.text, "message.txt") : checkPrDescription(entry.title, entry.text, "body.md");
    assert.deepEqual(actual, entry.expected, `${entry.kind}: ${entry.text}`);
  }
});

test("custom Git comment markers and scissors preserve authored commit content", () => {
  assert.equal(checkCommitMessage("; comment\nFix bounded process cleanup\n\nAn authored explanation.\n", "message", ";").status, "passed");
  assert.equal(checkCommitMessage("Fix bounded process cleanup\n; ---------------- >8 ----------------\nDiscard this body\n", "message").findings[0]!.rule_id, "commit-message.body-missing");
});
