import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {runtimeMigrationPlan} from "../src/runtime-migration-plan.ts";
import {backupRuntimeState} from "../src/runtime-backup.ts";
import {requireHostInstructionCompletion} from "../src/host-instruction-transition.ts";
import {backedStartupHookTransition,applyBackedStartupHooks,assertNoLegacyStartupHooks} from "../src/startup-hook-transition.ts";
import {COMPILED_HOST_BLOCK} from "../src/provider-guidance.ts";

test("backed startup migration binds receipt identity and retains admission on incomplete hook transition",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"backed-startup-"))),registry=join(root,"registry.sqlite"),generations=new RuntimeGenerations(registry);
 try{
  mkdirSync(join(root,".codex"));
  const path=join(root,".codex/hooks.json"),receipts=join(root,"tasks.sqlite"),backup=join(root,"backup");
  const hooks={hooks:Object.fromEntries(Object.entries({SessionStart:90,SubagentStart:90,SessionEnd:3,UserPromptSubmit:10}).map(([name,timeout])=>[name,[{hooks:[{type:"command",command:'python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" codex',timeout}]}]]))};
  const original=JSON.stringify(hooks);writeFileSync(path,original);
  assert.throws(()=>assertNoLegacyStartupHooks(root),/remain active/);
  const plan=runtimeMigrationPlan(root),maintenance=generations.beginMaintenance("test",0);
  await backupRuntimeState(registry,maintenance.token,maintenance.owner,plan.inputs,backup);
  assert.throws(()=>requireHostInstructionCompletion(registry,plan.hostPlan,COMPILED_HOST_BLOCK,backup,maintenance.token,maintenance.owner),/explicit startup receipt/);
  const required=requireHostInstructionCompletion(registry,plan.hostPlan,COMPILED_HOST_BLOCK,backup,maintenance.token,maintenance.owner,receipts);
  assert.equal(required.startup?.complete,false);
  assert.throws(()=>generations.endMaintenance(maintenance.token,maintenance.owner),/completion readback/);
  assert.throws(()=>applyBackedStartupHooks(registry,root,backup,receipts,maintenance.token,maintenance.owner),/pre-write activation/);
  assert.throws(()=>requireHostInstructionCompletion(registry,plan.hostPlan,COMPILED_HOST_BLOCK,backup,maintenance.token,maintenance.owner,join(root,"different.sqlite")),/identity differs/);
  writeFileSync(path,original+" ");
  assert.throws(()=>backedStartupHookTransition(root,backup,receipts),/outside backed transition/);
  writeFileSync(path,required.startup!.content);
  assert.doesNotThrow(()=>assertNoLegacyStartupHooks(root));
  assert.equal(backedStartupHookTransition(root,backup,receipts)?.complete,true);
  assert.equal(requireHostInstructionCompletion(registry,plan.hostPlan,COMPILED_HOST_BLOCK,backup,maintenance.token,maintenance.owner,receipts).hostInstructionsDigest,required.hostInstructionsDigest);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});


test("activation refuses legacy startup commands in every backed provider configuration",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"provider-startup-retirement-")));
 try {
  for(const relative of [".codex/hooks.json",".claude/settings.json",".claude/settings.local.json",".gemini/settings.json"]) {
   const path=join(root,relative);mkdirSync(join(root,relative.split("/")[0]!),{recursive:true});
   writeFileSync(path,JSON.stringify({hooks:{SessionStart:[{matcher:"*",hooks:[{type:"command",command:"python3 tools/governance-startup.py"}]}]}}));
   assert.throws(()=>assertNoLegacyStartupHooks(root),error=>error instanceof Error && error.message.includes(relative));
   writeFileSync(path,JSON.stringify({description:"governance-startup.py was retired",hooks:{SessionStart:[{hooks:[{type:"command",command:"project-governance startup observe"}]}]}}));
   assert.doesNotThrow(()=>assertNoLegacyStartupHooks(root));
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
