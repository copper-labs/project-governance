import { backedMigrationInputs } from "../src/backed-migration-inputs.ts";
import { backupRuntimeState } from "../src/runtime-backup.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { digest } from "../src/core.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readCurrentMigrationPlan, runtimeMigrationPlan } from "../src/runtime-migration-plan.ts";

test("migration file discovery is deterministic, preserves authored files and exposes scope limits", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),"migration-plan-")));
  try {
    mkdirSync(join(root,"config/validation/packs"),{recursive:true}); mkdirSync(join(root,".githooks"));
    mkdirSync(join(root,".governance/runtime/bin"),{recursive:true});
    for (const name of ["project-governance","harness-agent"]) writeFileSync(join(root,".governance/runtime/bin",name),"#!/old/python\n",{mode:0o755});
    writeFileSync(join(root,"AGENTS.md"),"Authored policy\n");
    writeFileSync(join(root,"config/validation/packs/check.yaml"),"id: check\n");
    writeFileSync(join(root,".githooks/pre-commit"),"#!/bin/sh\nexit 0\n",{mode:0o755});
    mkdirSync(join(root,"config/policies"));
    for(let i=0;i<65;i++)writeFileSync(join(root,"config/policies",`${i}.yaml`),`rule: ${i}\n`);
    const plan = runtimeMigrationPlan(root);
    assert.equal(plan.sources.filter(source=>source.path.startsWith("config/policies/")).length,65);
    assert.deepEqual(runtimeMigrationPlan(root),plan);
    assert.equal(plan.runtimeEntrypoints.length,2);
    assert.equal(plan.runtimeEntrypoints.find(entry=>entry.path.endsWith("harness-agent"))?.disposition,"retire-after-qualified-cutover");
    assert.ok(plan.inputs.some(input=>input.path.endsWith("/bin/harness-agent")));
    assert.ok(plan.sources.some(source=>source.path==="config/validation/packs/check.yaml"));
    assert.equal(plan.sources.find(source=>source.path===".githooks/pre-commit")?.mode,0o755);
    assert.ok(plan.unresolvedInventory.includes("legacy-live-owners"));
    assert.equal(readFileSync(join(root,"AGENTS.md"),"utf8"),"Authored policy\n");
    writeFileSync(join(root,"config/validation/packs/check.yaml"),"id: changed\n");
    assert.notEqual(runtimeMigrationPlan(root).planDigest,plan.planDigest);
    symlinkSync(join(root,"AGENTS.md"),join(root,"config/validation/alias"));
    assert.throws(()=>runtimeMigrationPlan(root),/aliases/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("saved migration plans reject file drift, scope growth and replacement of the original plan", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),"migration-saved-")));
  try {
    mkdirSync(join(root,"config/policies"),{recursive:true});
    const source = join(root,"config/policies/rule.yaml"), saved = join(root,"plan.json");
    writeFileSync(source,"rule: original\n");
    const plan = runtimeMigrationPlan(root);
    writeFileSync(saved,JSON.stringify(plan));
    assert.deepEqual(readCurrentMigrationPlan(saved,plan.planDigest),plan);
    writeFileSync(source,"rule: changed\n");
    assert.throws(()=>readCurrentMigrationPlan(saved),/plan changed/);
    writeFileSync(source,"rule: original\n");
    writeFileSync(join(root,"config/policies/added.yaml"),"rule: added\n");
    assert.throws(()=>readCurrentMigrationPlan(saved),/plan changed/);
    writeFileSync(saved,JSON.stringify(runtimeMigrationPlan(root)));
    assert.throws(()=>readCurrentMigrationPlan(saved,plan.planDigest),/replaced during backup/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});


test("completion reuses saved discovery only when every selected input matches its backup",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"backed-project-plan-")));
 const generations=new RuntimeGenerations(join(root,"generations.sqlite"));
 try {
  mkdirSync(join(root,"config/policies"),{recursive:true});
  const file=join(root,"config/policies/rule.yaml"),saved=join(root,"plan.json"),backup=join(root,"backup");
  writeFileSync(file,"rule: original");
  const plan=runtimeMigrationPlan(root);writeFileSync(saved,JSON.stringify(plan));
  // Init creates canonical product directories before capturing absent target records.
  mkdirSync(join(root,"config/governance"),{recursive:true});
  mkdirSync(join(root,".governance/runtime/bin"),{recursive:true});
  const owner=generations.beginMaintenance("test",0);
  await backupRuntimeState(join(root,"generations.sqlite"),owner.token,owner.owner,plan.inputs,backup);
  assert.deepEqual(backedMigrationInputs(saved,backup,root),plan.inputs);
  writeFileSync(file,"rule: transitioned");
  assert.deepEqual(backedMigrationInputs(saved,backup,root),plan.inputs);
  assert.throws(()=>backedMigrationInputs(saved,backup,root+"/other"),/Invalid backed/);
  const {planDigest,...changed}=plan;
  changed.sources=changed.sources.map(source=>source.path==="config/policies/rule.yaml" && source.mode!==null?{...source,sourceDigest:"sha256:"+"f".repeat(64)}:source);
  writeFileSync(saved,JSON.stringify({...changed,planDigest:digest(changed)}));
  assert.throws(()=>backedMigrationInputs(saved,backup,root),/differs from verified backup/);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});

test("migration scope binds native hook configuration and legacy launcher presence without reading unrelated provider state",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"migration-native-")));
 try {
  const saved=join(root,"plan.json"),initial=runtimeMigrationPlan(root);
  assert.equal(initial.sources.find(source=>source.path===".codex/hooks.json")?.kind,"absent");
  assert.equal(initial.sources.find(source=>source.path==="tools/governance-bootstrap.py")?.kind,"absent");
  writeFileSync(saved,JSON.stringify(initial));
  mkdirSync(join(root,".codex"));writeFileSync(join(root,".codex/hooks.json"),'{"hooks":{}}');
  writeFileSync(join(root,".codex/auth.json"),'private unrelated state');
  mkdirSync(join(root,"tools"));writeFileSync(join(root,"tools/governance-startup.py"),'legacy startup');
  writeFileSync(join(root,"tools/governance-bootstrap.py"),'legacy bootstrap');
  mkdirSync(join(root,".github/workflows"),{recursive:true});
  writeFileSync(join(root,".github/workflows/ci.yml"),'jobs: {}\n');
  assert.throws(()=>readCurrentMigrationPlan(saved),/plan changed/);
  const current=runtimeMigrationPlan(root);
  assert.equal(current.sources.find(source=>source.path===".codex/hooks.json")?.kind,"file");
  assert.equal(current.sources.find(source=>source.path==="tools/governance-startup.py")?.kind,"file");
  assert.equal(current.sources.find(source=>source.path==="tools/governance-bootstrap.py")?.kind,"file");
  assert.equal(current.sources.find(source=>source.path===".github/workflows/ci.yml")?.kind,"file");
  writeFileSync(saved,JSON.stringify(current));
  writeFileSync(join(root,"tools/governance-bootstrap.py"),'changed bootstrap');
  assert.throws(()=>readCurrentMigrationPlan(saved),/plan changed/);
  assert.equal(current.sources.some(source=>source.path===".codex/auth.json"),false);
  assert.ok(current.unresolvedInventory.includes("native-hook-trust-and-legacy-handler-transition"));
  rmSync(join(root,".codex"),{recursive:true});symlinkSync(join(root,"tools"),join(root,".codex"));
  assert.throws(()=>runtimeMigrationPlan(root),/canonical/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
