import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { providerAssignment } from "../src/provider-assignment.ts";

test("assignment preserves legacy authority restrictions for each workspace access mode", () => {
  for (const access of ["reader", "writer", "exclusive"] as const) {
    const request = { task: "Inspect the reported bug", workspace: "/workspace", role: "reviewer", additionalRoots: [],
      constraints: "Do not publish", access, requiredTools: ["command"], context: "fixture evidence" };
    const legacy = { ...request, access: access === "reader" ? "shared" : "exclusive", allow_readers: access === "writer",
      additional_roots: request.additionalRoots, required_tools: request.requiredTools };
    const expected = execFileSync("python3", ["-c", "import json,sys;sys.path.insert(0,'src');from project_governance_runtime.provider_agents.protocol import prompt;print(prompt(json.load(sys.stdin)),end='')"], { input: JSON.stringify(legacy), encoding: "utf8" });
    assert.equal(providerAssignment(request), expected);
  }
});

test("assignment refuses oversized composed prompts and embedded NUL", () => {
  const request = { task: "task", workspace: "/workspace", role: "coder", additionalRoots: [], constraints: "", access: "exclusive" as const, requiredTools: [], context: "" };
  assert.throws(() => providerAssignment({ ...request, context: "é".repeat(250000) }), /input bounds/);
  assert.throws(() => providerAssignment({ ...request, constraints: "bad\0constraint" }), /input bounds/);
});
