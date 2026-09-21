import {digest} from "../src/core.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {StartupTasks} from "../src/startup-tasks.ts";
const event={session_id:"one",hook_event_name:"SessionStart",source:"startup"},lock="sha256:"+"a".repeat(64);
test("startup receipts consume discovery once across reconnect, close and reopen",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-tasks-"))),path=join(root,"tasks.sqlite");
 let store=new StartupTasks(path);
 try {
  const initial=store.event("codex",event,root,lock);assert.equal(initial.discover,true);
  if(!("taskId" in initial))throw new Error("Missing identity");
  const host={provider:"codex" as const,host:"fixture",pid:123,fingerprint:"start"};
  const reader={registry:path,token:"reservation",owner:`startup-task:${initial.taskId}`,revision:1,directory:root};
  store.bindOwner(initial.taskId,host,reader);store.bindOwner(initial.taskId,host,reader);
  assert.throws(()=>store.bindOwner(initial.taskId,{...host,pid:124},reader),/owner changed/);
  store.close();store=new StartupTasks(path);
  assert.deepEqual(store.owner(initial.taskId),{host,reader});
  const second=new StartupTasks(path);
  try{assert.equal(second.event("codex",event,root,lock).discover,false);}finally{second.close();}
  store.completeDiscovery(initial.taskId,lock,{status:"current"});
  assert.throws(()=>store.completeDiscovery(initial.taskId,lock,{status:"available"}),/no longer pending/);
  store.event("codex",{...event,hook_event_name:"SessionEnd"},root,lock);
  assert.throws(()=>store.retireOwner(initial.taskId,()=>{throw new Error("release failed");}),/release failed/);
  assert.deepEqual(store.owner(initial.taskId),{host,reader});
  store.retireOwner(initial.taskId,binding=>assert.deepEqual(binding,{host,reader}));
  assert.equal(store.owner(initial.taskId),null);
  const reopened=store.event("codex",{...event,hook_event_name:"UserPromptSubmit"},root,lock);
  assert.equal(reopened.discover,false);if("result" in reopened)assert.deepEqual(reopened.result,{status:"current"});
  store.bindOwner(initial.taskId,host,{...reader,token:"new-reservation"});
  const bound=store.owner(initial.taskId)!;
  assert.throws(()=>store.recoverOwner(initial.taskId,digest(bound),()=>{throw new Error("host alive");}),/host alive/);
  assert.deepEqual(store.owner(initial.taskId),bound);
  const recovered=store.recoverOwner(initial.taskId,digest(bound),()=>({taskOutcome:"unknown",reservation:"released"}));
  assert.deepEqual(store.recoverOwner(initial.taskId,digest(bound),()=>{throw new Error("must not repeat");}),recovered);
  const changed=store.event("codex",event,root,"sha256:"+"b".repeat(64));
  assert.equal(changed.discover,false);if("refreshRequired" in changed)assert.equal(changed.refreshRequired,true);
  store.event("codex",{...event,session_id:"ended-first",hook_event_name:"SessionEnd"},root,lock,{});
  assert.equal(store.event("codex",{...event,session_id:"ended-first"},root,lock,{}).discover,false);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
test("startup completion rebinds its task once and retains ownership on finalization failure",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-rebind-"))),path=join(root,"tasks.sqlite"),store=new StartupTasks(path);
 try {
  const task=store.event("codex",event,root,lock,{});assert.ok("taskId" in task);
  const host={provider:"codex" as const,host:"fixture",pid:123,fingerprint:"start"};
  const reader={registry:path,owner:`startup-task:${task.taskId}`,token:"reservation",revision:1,directory:root};
  store.bindOwner(task.taskId,host,reader);
  const binding=store.owner(task.taskId)!,expected=digest(binding),nextLock="sha256:"+"b".repeat(64),commit="c".repeat(40);
  assert.throws(()=>store.completeUpdate(task.taskId,expected,nextLock,commit,()=>{throw new Error("readback failed");}),/readback failed/);
  assert.deepEqual(store.owner(task.taskId),binding);
  const next={...reader,revision:2,directory:join(root,"next")};
  assert.throws(()=>store.completeUpdate(task.taskId,expected,nextLock,commit,()=>({...next,token:"wrong"})),/successor reader/);
  const completed=store.completeUpdate(task.taskId,expected,nextLock,commit,()=>next);
  assert.deepEqual(store.owner(task.taskId),{host,reader:next});
  assert.deepEqual(store.completeUpdate(task.taskId,expected,nextLock,commit,()=>{throw new Error("must not repeat");}),completed);
  assert.throws(()=>store.completeUpdate(task.taskId,expected,nextLock,"d".repeat(40),()=>next),/replay differs/);
  const prompt=store.event("codex",{...event,hook_event_name:"UserPromptSubmit"},root,nextLock,{});
  assert.equal(prompt.discover,false);assert.ok("refreshRequired" in prompt);assert.equal(prompt.refreshRequired,false);
  store.event("codex",{...event,hook_event_name:"SessionEnd"},root,nextLock,{});
  store.retireOwner(task.taskId,value=>assert.deepEqual(value,{host,reader:next}));
  assert.equal(store.owner(task.taskId),null);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
test("task closure during an update preserves recovery binding and retires the successor on completion",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-close-update-"))),path=join(root,"tasks.sqlite"),store=new StartupTasks(path);
 try {
  const task=store.event("codex",event,root,lock,{});assert.ok("taskId" in task);
  const host={provider:"codex" as const,host:"fixture",pid:123,fingerprint:"start"};
  const reader={registry:path,owner:`startup-task:${task.taskId}`,token:"reservation",revision:1,directory:root};
  store.bindOwner(task.taskId,host,reader);
  const binding=store.owner(task.taskId)!,expected=digest(binding),next={...reader,revision:2,directory:join(root,"next")};
  const nextLock="sha256:"+"b".repeat(64),commit="c".repeat(40);
  store.event("codex",{...event,hook_event_name:"SessionEnd"},root,lock,{});
  assert.equal(store.retireOwner(task.taskId,()=>false),false);
  assert.deepEqual(store.owner(task.taskId),binding);
  assert.throws(()=>store.completeUpdate(task.taskId,expected,nextLock,commit,()=>next),/owner or task changed/);
  assert.throws(()=>store.completeUpdate(task.taskId,expected,nextLock,commit,()=>next,()=>{throw new Error("retirement interrupted");}),/retirement interrupted/);
  assert.deepEqual(store.owner(task.taskId),binding);
  let retired=0;
  const result=store.completeUpdate(task.taskId,expected,nextLock,commit,()=>next,value=>{assert.deepEqual(value,next);retired++;});
  assert.equal(store.owner(task.taskId),null);assert.equal(retired,1);
  assert.deepEqual(store.completeUpdate(task.taskId,expected,nextLock,commit,()=>{throw new Error("must replay");}),result);
  assert.equal(store.retireOwner(task.taskId,value=>assert.equal(value,null)),true);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
test("startup cancellation preserves binding on failure and consumes discovery once",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-cancel-task-"))),path=join(root,"tasks.sqlite"),store=new StartupTasks(path);
 try {
  const task=store.event("codex",event,root,lock,{});assert.ok("taskId" in task);
  const host={provider:"codex" as const,host:"fixture",pid:123,fingerprint:"start"};
  const reader={registry:path,owner:`startup-task:${task.taskId}`,token:"reservation",revision:1,directory:root};
  store.bindOwner(task.taskId,host,reader);const binding=store.owner(task.taskId)!,expected=digest(binding);
  assert.throws(()=>store.cancelUpdate(task.taskId,expected,"operation",()=>{throw new Error("interrupted restoration");}),/interrupted restoration/);
  assert.deepEqual(store.owner(task.taskId),binding);
  const result=store.cancelUpdate(task.taskId,expected,"operation",(value,closed)=>{assert.deepEqual(value,binding);assert.equal(closed,false);});
  assert.deepEqual(store.cancelUpdate(task.taskId,expected,"operation",()=>assert.fail("must replay")),result);
  assert.throws(()=>store.cancelUpdate(task.taskId,"sha256:"+"f".repeat(64),"operation",()=>{}),/replay differs/);
  const prompt=store.event("codex",{...event,hook_event_name:"UserPromptSubmit"},root,lock,{});
  assert.equal(prompt.discover,false);assert.deepEqual(store.owner(task.taskId),binding);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
test("pre-write restoration rebinds an open task to the restored generation",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-restored-task-"))),path=join(root,"tasks.sqlite"),store=new StartupTasks(path);
 try {
  const task=store.event("codex",event,root,lock,{});assert.ok("taskId" in task);
  const host={provider:"codex" as const,host:"fixture",pid:123,fingerprint:"start"};
  const reader={registry:path,owner:`startup-task:${task.taskId}`,token:"reservation",revision:1,directory:root};
  store.bindOwner(task.taskId,host,reader);const expected=digest(store.owner(task.taskId));
  const restored={...reader,revision:3};
  assert.throws(()=>store.cancelUpdate(task.taskId,expected,"restoration",()=>({...restored,directory:join(root,"other")})),/restored reader identity/);
  const result=store.cancelUpdate(task.taskId,expected,"restoration",()=>restored);
  assert.deepEqual(store.owner(task.taskId),{host,reader:restored});
  assert.deepEqual(store.cancelUpdate(task.taskId,expected,"restoration",()=>assert.fail("must replay")),result);
  store.event("codex",{...event,hook_event_name:"SessionEnd"},root,lock,{});
  store.retireOwner(task.taskId,value=>assert.deepEqual(value,{host,reader:restored}));
  assert.equal(store.owner(task.taskId),null);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
