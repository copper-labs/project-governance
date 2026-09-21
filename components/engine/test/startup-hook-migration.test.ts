import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {planStartupHookMigration} from "../src/startup-hook-migration.ts";

test("startup migration recognizes the shipped wheel handlers and preserves authored groups",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"legacy-hooks-")));
 try {
  mkdirSync(join(root,".codex"));
  const original=JSON.parse(execFileSync("python3",["-c","import sys;sys.path.insert(0,'src');from pathlib import Path;from project_governance_runtime.startup_integration import hook_config;print(hook_config(Path(sys.argv[1]),'codex')[1])",root],{encoding:"utf8"}));
  original.description="Authored metadata";
  const authored={matcher:"resume",hooks:[{type:"command",command:"authored-check",timeout:2}]};
  original.hooks.SessionStart.unshift(authored);
  const before=JSON.stringify(original),plan=planStartupHookMigration(original,root,join(root,"external.sqlite"));
  assert.equal(JSON.stringify(original),before);assert.equal(plan.migrated.length,4);
  assert.equal(plan.authority,"proposal-only");assert.equal(plan.configuration.description,"Authored metadata");
  assert.deepEqual((plan.configuration.hooks as typeof original.hooks).SessionStart[0],authored);
  assert.doesNotMatch(plan.content,/governance-startup\.py/);
  assert.equal(planStartupHookMigration(plan.configuration,root,join(root,"external.sqlite")).content,plan.content);
  const partial=structuredClone(original);delete partial.hooks.SessionEnd;
  assert.throws(()=>planStartupHookMigration(partial,root,join(root,"external.sqlite")),/Incomplete/);
  const custom=structuredClone(original);custom.hooks.SessionEnd[0].matcher="other";
  assert.throws(()=>planStartupHookMigration(custom,root,join(root,"external.sqlite")),/Customized/);
  const duplicate=structuredClone(original);duplicate.hooks.SessionEnd.push(duplicate.hooks.SessionEnd[0]);
  assert.throws(()=>planStartupHookMigration(duplicate,root,join(root,"external.sqlite")),/duplicate/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
