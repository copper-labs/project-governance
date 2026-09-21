import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { finalizeRuntimeActivation } from "../src/runtime-finalization.ts";
import { assertNoWheelInterpreterDependency } from "../src/runtime-target-dependencies.ts";

test("compiled activation rejects target dependence on retired wheel interpreters", () => {
  const root = mkdtempSync(join(tmpdir(), "target-interpreter-")), directory = join(root, "config/validation/packs");
  try {
    assertNoWheelInterpreterDependency(root);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "target.yaml");
    for (const run of [".governance/runtime/bin/harness-agent test-batch", "python3 tools/governance-startup.py codex", "python3 tools/governance-bootstrap.py", ".governance/runtime/bin/python check.py", [".governance/runtime/bin/python3.9", "check.py"], '".governance/runtime/bin/python" check.py', [".governance\\runtime\\Scripts\\python.exe", "check.py"]]) {
      writeFileSync(path, JSON.stringify({ id: "target-check", commands: [{ run }] }));
      assert.throws(() => assertNoWheelInterpreterDependency(root), /target-check.*project-owned interpreter/);
    }
    for (const run of [[".tools/checks/bin/python", "check.py"], "python3 check.py", "node check.mjs", ".governance/runtime/bin/project-governance check"]) {
      writeFileSync(path, JSON.stringify({ id: "target-check", commands: [{ run }] }));
      assertNoWheelInterpreterDependency(root);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("compiled activation refuses executable legacy CI steps even without target packs",()=>{
 const root=mkdtempSync(join(tmpdir(),"legacy-ci-bootstrap-"));
 try {
  const directory=join(root,".github/workflows");mkdirSync(directory,{recursive:true});
  const path=join(directory,"ci.yml");
  for (const run of ["python3 tools/governance-bootstrap.py", ".governance/runtime/bin/harness-agent test-batch",
    "python3 tools/governance-startup.py codex", '".governance/runtime/bin/python3.9" check.py']) {
   writeFileSync(path,JSON.stringify({jobs:{check:{steps:[{run}]}}}));
   assert.throws(()=>assertNoWheelInterpreterDependency(root),/ci.yml:check.*Migrate bootstrap/);
  }
  writeFileSync(path,JSON.stringify({jobs:{check:{name:"tools/governance-bootstrap.py historical label",steps:[{run:"node tools/governance-bootstrap.mjs"}]},shared:{uses:"example/repo/.github/workflows/check.yml@pinned"}}}));
  assertNoWheelInterpreterDependency(root);
 }finally{rmSync(root,{recursive:true,force:true});}
});

// Finalization is independently callable and must recheck project integration before admission.
test("final activation refuses wheel dependencies introduced after preparation", () => {
  const root = mkdtempSync(join(tmpdir(), "finalize-wheel-dependency-"));
  try {
    const directory = join(root, "config/validation/packs");
    mkdirSync(directory, { recursive: true });
    assertNoWheelInterpreterDependency(root);
    writeFileSync(join(directory, "target.yaml"), JSON.stringify({ id: "late-check",
      commands: [{ run: [".governance/runtime/bin/python", "check.py"] }] }));
    assert.throws(() => finalizeRuntimeActivation(root, root, "token", "owner"), /late-check.*project-owned interpreter/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
