import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { reconcileProviderCompletion } from "../src/provider-completion.ts";
const completion = { outcome: "completed", answer: "Work completed", artifacts: [], sources: [], remaining: [],
  checks: [{ description: "Tests", result: "passed", evidence: "model-reported" }] };
test("native completion reconciliation matches legacy tool and denial semantics", () => {
  const cases = [
    { tools: [], denied: [], required: ["command"] },
    { tools: [{ name: "Bash", category: "command", state: "DONE" }], denied: [], required: ["command", "Bash"] },
    { tools: [{ name: "Bash", category: "command", state: "ACTIVE" }], denied: [{ resolved: false }], required: ["command"] },
    { tools: [{ name: "Bash", category: "command", state: "DONE", error: "denied" }], denied: [{ resolved: true }], required: ["command"] },
  ];
  const python = `import sys,json\nsys.path.insert(0,'src')\nfrom project_governance_runtime.provider_agents.protocol import Protocol\np=json.load(sys.stdin)\nr=[]\nfor c in p['cases']:\n x=Protocol({'required_tools':c['required']},lambda *a,**k:None)\n x.init={'verified':True};x.done=True;x.final={'structured_output':p['completion']}\n x.tools={str(i):t for i,t in enumerate(c['tools'])};x.denied=c['denied']\n state,value=x.finish();r.append({'state':state,'completion':value})\nprint(json.dumps(r))`;
  const expected = JSON.parse(execFileSync("python3", ["-c", python], { input: JSON.stringify({ cases, completion }), encoding: "utf8" }));
  assert.deepEqual(cases.map(c => reconcileProviderCompletion(completion, c.tools, c.denied, c.required)), expected);
  assert.equal(expected[0].state, "blocked"); assert.equal(expected[1].state, "succeeded");
});
test("completion claims cannot bypass missing fields or declared remaining work", () => {
  assert.throws(() => reconcileProviderCompletion({ ...completion, checks: ["passed"] }, [], [], []), /check evidence/);
  assert.throws(() => reconcileProviderCompletion({ ...completion, answer: " " }, [], [], []), /final answer/);
  assert.equal(reconcileProviderCompletion({ ...completion, remaining: ["device proof missing"] }, [], [], []).state, "blocked");
  assert.equal(reconcileProviderCompletion({ ...completion, outcome: "incomplete" }, [], [], []).state, "blocked");
});
