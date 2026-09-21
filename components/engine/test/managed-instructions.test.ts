import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mergeManagedInstructions } from "../src/managed-instructions.ts";
const start = "<!-- harness-delegation:start -->", end = "<!-- harness-delegation:end -->";
const block = `${start}\nUse the installed shared instructions.\n${end}`;

test("managed instruction merge preserves authored text and matches the legacy owner", () => {
  const inputs = ["", "Authored instructions\r\nKeep these.", `Before\r\n${start}\nOld pointer\n${end}\r\nAfter`, block];
  const python = `import sys,json\nsys.path.insert(0,'src')\nfrom project_governance_runtime import harness_integration as h\np=json.load(sys.stdin)\nh.BLOCK=p['block']\nprint(json.dumps([h._merged(s) for s in p['inputs']]))`;
  const expected = JSON.parse(execFileSync("python3", ["-c", python], { input: JSON.stringify({ inputs, block }), encoding: "utf8" }));
  assert.deepEqual(inputs.map(input => mergeManagedInstructions(input, block)), expected);
  for (const input of inputs) {
    const merged = mergeManagedInstructions(input, block);
    assert.equal(mergeManagedInstructions(merged, block), merged);
  }
});

test("empty overrides remain inactive and malformed sections are refused", () => {
  for (const content of ["", " \n\t"]) assert.equal(mergeManagedInstructions(content, block, true), content);
  assert.equal(mergeManagedInstructions("Authored override", block, true), block + "\n\nAuthored override");
  for (const content of [start, end, end + start, start + start + end, start + end + end]) {
    assert.throws(() => mergeManagedInstructions(content, block), /Malformed/);
  }
  for (const invalid of ["unmarked", end + start, start + end + end]) assert.throws(() => mergeManagedInstructions("authored", invalid), /enclosing/);
});
