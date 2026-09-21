import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {StartupTasks} from "../src/startup-tasks.ts";
import {assessStartup} from "../src/startup-assessment.ts";
import {fileDigest} from "../src/core.ts";

test("startup assessment binds native parent, retained scope and unchanged runtime",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-assessment-"))),workspace=join(root,"project");
 mkdirSync(join(workspace,"config/governance"),{recursive:true});
 const lock=join(workspace,"config/governance/runtime.lock.yaml"),profile=join(workspace,"config/governance/profile.yaml");
 writeFileSync(lock,"{}\n");writeFileSync(profile,"runtime_updates:\n  policy: compatible\n");
 const receipts=join(root,"tasks.sqlite"),store=new StartupTasks(receipts),environment={...process.env,CODEX_THREAD_ID:"native-session"};
 try {
  const task=store.event("codex",{session_id:"native-session",hook_event_name:"SessionStart",source:"startup"},workspace,fileDigest(lock),{});
  assert.ok("taskId" in task);
  const input={workspace,registry:receipts,receipts,task:task.taskId,workState:"minor",reason:"Small independent change"};
  assert.throws(()=>assessStartup(input,{...environment,CODEX_THREAD_ID:"different"}),/owning native parent/);
  assert.throws(()=>assessStartup(input,{...environment,HARNESS_AGENT_ANCESTRY:"child"}),/owning native parent/);
  for(const workState of ["read-only","review","substantial-plan"])
   assert.equal(assessStartup({...input,workState},environment).status,"deferred");
  assert.equal(assessStartup(input,environment).reason,"native-owner-unrecorded");
  store.bindOwner(task.taskId,{host:"fixture",pid:123,provider:"codex",fingerprint:"start"},
   {registry:receipts,owner:`startup-task:${task.taskId}`,token:"held",revision:1,directory:workspace});
  const git=(...args:string[])=>execFileSync("git",args,{cwd:workspace,stdio:["ignore","pipe","pipe"]});
  git("init");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");
  git("add",".");git("-c","core.hooksPath=/dev/null","-c","commit.gpgsign=false","commit","-m","fixture");
  const capture=()=>({host:"fixture",pid:123,provider:"codex" as const,fingerprint:"start"});
  assert.throws(()=>assessStartup(input,environment,()=>null),/Current native host differs/);
  const assessed=assessStartup(input,environment,capture);assert.equal(assessed.status,"preparation-required");
  assert.ok("snapshot" in assessed);assert.equal(assessed.authority,"assessment-only");
  writeFileSync(lock,"changed\n");assert.throws(()=>assessStartup(input,environment),/Runtime changed/);
  writeFileSync(lock,"{}\n");
  store.event("codex",{session_id:"native-session",hook_event_name:"SessionEnd"},workspace,fileDigest(lock),{});
  assert.throws(()=>assessStartup(input,environment),/open task/);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
