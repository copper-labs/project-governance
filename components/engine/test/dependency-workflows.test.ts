import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkflowDependencies } from "../src/checkers/dependency-workflows.ts";

test("workflow extraction covers reusable jobs and action steps with stable repair identities", () => {
  const sha = "A".repeat(40);
  const source = `jobs:\n  reusable:\n    uses: Example/Repo/.github/workflows/build.yml@${sha}\n  build:\n    steps:\n      - uses: ./local/action\n      - uses: actions/checkout@v4\n      - run: echo hello\n`;
  const result = parseWorkflowDependencies(".github/workflows/build.yml", source);
  assert.deepEqual(result.values, [{ ecosystem: "github-actions", name: "example/repo/.github/workflows/build.yml", version: sha.toLowerCase(), artifact_type: "ci" }]);
  assert.deepEqual(result.defects[0]?.identity, ["workflow-action", "actions/checkout@v4"]);
  assert.deepEqual(result.defects[0]?.repair_key, ["workflow-action", "actions/checkout"]);
});

test("workflow formats fail closed instead of omitting dependency-bearing surfaces", () => {
  for (const source of ["jobs: []", "jobs: {build: {steps: {}}}", "jobs: {build: {services: {}}}", "jobs: {build: {container: image}}", "jobs: {build: {steps: [{uses: 12}]}}", "jobs: {build: {steps: [{uses: 'docker://image'}]}}", "jobs: {}\njobs: {}"])
    assert.throws(() => parseWorkflowDependencies("workflow.yml", source));
});
