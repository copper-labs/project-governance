import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync,existsSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {startupHooks} from "../src/startup-hooks.ts";
import {startupCommand} from "../src/startup-command.ts";

test("startup hook proposal preserves authored settings and repeats without duplicates",()=>{
 const original={custom:{enabled:true},hooks:{SessionStart:[{matcher:"resume",hooks:[{type:"command",command:"authored-hook",timeout:5}]}]}};
 const before=JSON.stringify(original),plan=startupHooks(original,"/project","/external/tasks.sqlite");
 assert.equal(JSON.stringify(original),before);
 assert.deepEqual(plan.configuration.custom,original.custom);
 const hooks=plan.configuration.hooks as typeof original.hooks;
 assert.deepEqual(hooks.SessionStart[0],original.hooks.SessionStart[0]);
 assert.equal(hooks.SessionStart.length,2);
 assert.deepEqual(startupHooks(plan.configuration,"/project","/external/tasks.sqlite"),plan);
});
test("startup hook proposal refuses conflicting, legacy and malformed configuration",()=>{
 const plan=startupHooks({},"/project","/external/tasks.sqlite");
 const linked=startupHooks(plan.configuration,"/another","/other-state/tasks.sqlite");
 assert.deepEqual(linked.configuration,plan.configuration);
 assert.equal(linked.path,"/another/.codex/hooks.json");
 for(const value of [null,[],{hooks:[]},{hooks:{SessionStart:{}}},{hooks:{SessionStart:[{}]}}])
  assert.throws(()=>startupHooks(value,"/project","/external/tasks.sqlite"));
 assert.throws(()=>startupHooks({hooks:{SessionStart:[{hooks:[{command:"python3 tools/governance-startup.py codex"}]}]}},"/project","/external/tasks.sqlite"),/Legacy/);
 const hooks=plan.configuration.hooks as Record<string,unknown[]>;
 hooks.SessionStart!.push(structuredClone(hooks.SessionStart![0]));
 assert.throws(()=>startupHooks(plan.configuration,"/project","/external/tasks.sqlite"),/Duplicate/);
});
test("prompt hooks preserve complete bounded output and reconcile only the exact older managed shape",()=>{
 const plan=startupHooks({},"/project","/external/tasks.sqlite");
 const config=plan.configuration as {hooks:Record<string,{hooks:Record<string,unknown>[]}[]>};
 const prompt=config.hooks.UserPromptSubmit![0]!.hooks[0]!;
 assert.equal(prompt.additionalContextLimit,0);
 assert.equal(prompt.timeout,15);
 prompt.timeout=10;
 assert.equal(config.hooks.SessionStart![0]!.hooks[0]!.additionalContextLimit,undefined);
 delete prompt.additionalContextLimit;
 const original=JSON.stringify(config),updated=startupHooks(config,"/project","/external/tasks.sqlite");
 assert.equal(JSON.stringify(config),original);
 assert.equal((updated.configuration as typeof config).hooks.UserPromptSubmit![0]!.hooks[0]!.additionalContextLimit,0);
 assert.equal((updated.configuration as typeof config).hooks.UserPromptSubmit![0]!.hooks[0]!.timeout,15);
 prompt.additionalContextLimit=1200;
 assert.throws(()=>startupHooks(config,"/project","/external/tasks.sqlite"),/differs/);
});
test("startup hook command preserves quoted paths and stdin through the shell",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-hook-")));
 try {
  const workspace=join(root,"project ' $(false)"),bin=join(workspace,".governance/runtime/bin");
  mkdirSync(bin,{recursive:true});
  execFileSync("git",["init","-q"],{cwd:workspace});
  writeFileSync(join(bin,"project-governance"),'#!/bin/sh\nprintf "%s\\n" "$@"\ncat\n',{mode:0o700});
  const receipts=join(root,"state ' $(false).sqlite"),plan=startupHooks({},workspace,receipts);
  const hooks=plan.configuration.hooks as Record<string,{hooks:{command:string}[]}[]>;
  const output=execFileSync("/bin/sh",["-c",hooks.SessionStart![0]!.hooks[0]!.command],{cwd:workspace,input:'{"session_id":"example"}',encoding:"utf8",timeout:5000});
  assert.equal(output,`startup\nobserve\n--provider\ncodex\n--event-stdin\n{"session_id":"example"}`);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("startup hooks CLI proposes configuration without writes and refuses redirected settings",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-hook-plan-")));
 try {
  const scope={workspace:root,registry:join(root,"installation.sqlite")},receipts=join(dirname(scope.registry),"startup.sqlite");
  const plan=await startupCommand(["hooks","--receipts",receipts],scope) as ReturnType<typeof startupHooks>;
  assert.equal(plan.authority,"proposal-only");assert.equal(existsSync(join(root,".codex")),false);
  assert.equal(existsSync(receipts),false);assert.equal(existsSync(scope.registry),false);
  mkdirSync(join(root,".codex"));
  writeFileSync(join(root,".codex/hooks.json"),plan.content);
  assert.deepEqual(await startupCommand(["hooks","--receipts",receipts],scope),plan);
  await assert.rejects(startupCommand(["hooks","--receipts",join(root,"other.sqlite")],scope),/next to this worktree/);
  await assert.rejects(startupCommand(["hooks","--receipts",receipts,"--event-stdin"],scope),/accepts only/);
  rmSync(join(root,".codex/hooks.json"));symlinkSync(join(root,"missing.json"),join(root,".codex/hooks.json"));
  await assert.rejects(startupCommand(["hooks","--receipts",receipts],scope),/ordinary file/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
