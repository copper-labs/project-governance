import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { workflowAuthorization } from "../src/workflow-authorization.ts";

test("workflow policy defaults to operator and hashes normalized capability declarations", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-policy-"));
  try {
    assert.equal(workflowAuthorization(root).mode, "operator");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    const path = join(root, "config/governance/profile.yaml");
    const write = (resources: string[]) => writeFileSync(path, JSON.stringify({ workflow_authorization: {mode:"task", resources, credential_env:["FIXTURE_TOKEN"]} }));
    write(["b", "a"]);
    const first = workflowAuthorization(root);
    write(["a", "b"]);
    assert.equal(workflowAuthorization(root).digest, first.digest);
    writeFileSync(path, "workflow_authorization: [broken\n");
    assert.throws(() => workflowAuthorization(root));
    rmSync(path); symlinkSync(join(root, "missing"), path);
    assert.throws(() => workflowAuthorization(root), /symbolic|symlink|ELOOP/i);
  } finally { rmSync(root, {recursive:true, force:true}); }
});
