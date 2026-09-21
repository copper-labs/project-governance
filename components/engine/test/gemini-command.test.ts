import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { geminiCommand, geminiInput } from "../src/gemini-command.ts";
test("Gemini invocation matches native adapter timeout, schema, roots and conversation flags", () => {
  for (const timeoutSeconds of [0, 0.25, 65.2]) {
    const request = { executable: "/native/agy", workspace: "/work", model: "selected-high", effort: "high", additionalRoots: ["/extra root"], conversationId: "session", timeoutSeconds };
    const python = `import sys,json\nfrom pathlib import Path\nsys.path.insert(0,'src')\nfrom project_governance_runtime.provider_agents.gemini import Gemini\np=json.load(sys.stdin)\nr={'backend':p['executable'],'workspace':p['workspace'],'model':p['model'],'effort':p['effort'],'additional_roots':p['additionalRoots'],'conversation_id':p['conversationId'],'timeout_seconds':p['timeoutSeconds']}\nprint(json.dumps(Gemini(r,lambda *a,**k:None).command(Path('/job'))))`;
    const expected: string[] = JSON.parse(execFileSync("python3", ["-c", python], { input: JSON.stringify(request), encoding: "utf8" }));
    const actual = geminiCommand(request, "/job"), index = expected.indexOf("--json-schema") + 1;
    assert.deepEqual(JSON.parse(actual[index]!), JSON.parse(expected[index]!)); expected[index] = actual[index]!;
    assert.deepEqual(actual, expected);
  }
});
test("Gemini assignment framing preserves literal data and bounds encoded size", () => {
  const prompt = 'Assignment\n"literal" café';
  assert.deepEqual(JSON.parse(geminiInput(prompt)), { event: "user", message: { content: prompt } });
  assert.throws(() => geminiInput('"'.repeat(300000)), /500 KB/);
});
