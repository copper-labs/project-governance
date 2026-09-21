import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { claudeCommand } from "../src/claude-command.ts";
test("Claude command preserves legacy native flags, schema and resume identity", () => {
  const request = { executable: "/native/claude", model: "explicit-model", effort: "high", additionalRoots: ["/workspace with spaces"], conversationId: "session-id" };
  const python = `import sys,json\nsys.path.insert(0,'src')\nfrom project_governance_runtime.provider_agents.claude import Claude\np=json.load(sys.stdin)\nr={'backend':p['executable'],'model':p['model'],'effort':p['effort'],'additional_roots':p['additionalRoots'],'conversation_id':p['conversationId']}\nprint(json.dumps(Claude(r,lambda *a,**k:None).command(None)))`;
  const expected: string[] = JSON.parse(execFileSync("python3", ["-c", python], { input: JSON.stringify(request), encoding: "utf8" }));
  const actual = claudeCommand(request);
  for (const flag of ["--settings", "--json-schema"]) {
    const index = expected.indexOf(flag) + 1;
    assert.deepEqual(JSON.parse(actual[index]!), JSON.parse(expected[index]!));
    expected[index] = actual[index]!;
  }
  assert.deepEqual(actual, expected);
  assert.equal(actual.includes("--fallback-model"), false);
});
test("Claude command refuses ambiguous options and relative workspace roots", () => {
  const base = { executable: "/native/claude", model: "selected", effort: "high", additionalRoots: [] };
  for (const change of [{ executable: "claude" }, { model: "--fallback" }, { effort: "--other" }, { additionalRoots: ["relative"] }, { conversationId: "--latest" }]) {
    assert.throws(() => claudeCommand({ ...base, ...change }));
  }
});
