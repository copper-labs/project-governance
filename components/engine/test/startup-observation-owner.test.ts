import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {startupObservationOwner,recoverStartupObservation} from "../src/startup-observation-owner.ts";
import {StartupTasks} from "../src/startup-tasks.ts";
import {recoverStartupOwner} from "../src/startup-owner-recovery.ts";
import {digest} from "../src/core.ts";

test("observation recovery refuses live and parent owners and releases only a genuinely exited hook reader",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"observer-recovery-"))),registry=join(root,"registry.sqlite"),generations=new RuntimeGenerations(registry);
 try {
  // Isolate reader ownership from artifact staging; installed transition tests cover artifact identity.
  const db=new DatabaseSync(registry);db.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root);db.close();
  const parent=generations.reserveStartupTask(`sha256:${"a".repeat(64)}`);
  const live=generations.acquire(startupObservationOwner(root));
  assert.throws(()=>recoverStartupObservation(root,registry,live.token,"test"),/remains present/);
  assert.throws(()=>recoverStartupObservation(root,registry,parent.token,"test"),/lacks a recoverable/);
  const ownerModule=new URL("../src/startup-observation-owner.ts",import.meta.url).href;
  const registryModule=new URL("../src/runtime-generations.ts",import.meta.url).href;
  const script=`import {startupObservationOwner} from ${JSON.stringify(ownerModule)};import {RuntimeGenerations} from ${JSON.stringify(registryModule)};const g=new RuntimeGenerations(${JSON.stringify(registry)});console.log(JSON.stringify(g.acquire(startupObservationOwner(${JSON.stringify(root)}))));process.exit(7);`;
  let abandoned:{token:string}|undefined;
  try{execFileSync(process.execPath,["--input-type=module","-e",script],{encoding:"utf8",timeout:5000,stdio:"pipe"});assert.fail("child must exit abruptly");}
  catch(error){assert.equal((error as {status:number}).status,7);abandoned=JSON.parse(String((error as {stdout:string}).stdout));}
  const result=recoverStartupObservation(root,registry,abandoned!.token,"fixture:confirmed-exit");
  assert.equal(result.status,"released");assert.equal(result.observationOutcome,"unknown");
  assert.equal(generations.state().readers.length,2);
  assert.equal(recoverStartupObservation(root,registry,abandoned!.token,"fixture:repeat").status,"not-held");
  generations.release(live.token,live.owner);generations.release(parent.token,parent.owner);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});

test("planned startup reservation replays its exact token and refuses changed generation or ownership",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"planned-startup-"))),registry=join(root,"registry.sqlite"),generations=new RuntimeGenerations(registry);
 try {
  const db=new DatabaseSync(registry);db.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root);db.close();
  const task=`sha256:${"b".repeat(64)}`,planned={token:randomUUID(),revision:1,directory:root,owner:`startup-task:${task}`};
  assert.throws(()=>generations.reserveStartupTask(task,{...planned,revision:2}),/generation changed/);
  assert.equal(generations.state().readers.length,0);
  assert.deepEqual(generations.reserveStartupTask(task,planned),planned);
  assert.deepEqual(generations.reserveStartupTask(task,planned),planned);
  assert.throws(()=>generations.reserveStartupTask(task,{...planned,token:randomUUID()}),/reader changed/);
  assert.equal(generations.state().readers.length,1);
  generations.release(planned.token,planned.owner);
  // A persisted intent whose registry transaction never committed can be retired idempotently.
  assert.equal(generations.retireStartupReader(planned),true);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});

test("process exit after durable owner intent but before reader acquisition remains recoverable",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-intent-exit-"))),registry=join(root,"registry.sqlite"),receipts=join(root,"tasks.sqlite");
 const generations=new RuntimeGenerations(registry);
 try {
  const db=new DatabaseSync(registry);db.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root);db.close();
  const task=digest({provider:"codex",session:"intent-crash",workspace:root});
  const planned={registry,token:randomUUID(),revision:1,directory:root,owner:`startup-task:${task}`};
  const tasksModule=new URL("../src/startup-tasks.ts",import.meta.url).href;
  const processModule=new URL("../src/process-owner.ts",import.meta.url).href;
  const script=`import {StartupTasks} from ${JSON.stringify(tasksModule)};import {processFingerprint} from ${JSON.stringify(processModule)};import {hostname} from 'node:os';
const tasks=new StartupTasks(${JSON.stringify(receipts)});
tasks.event('codex',{hook_event_name:'SessionStart',source:'startup',session_id:'intent-crash'},${JSON.stringify(root)},${JSON.stringify(digest("lock"))},{});
tasks.bindOwner(${JSON.stringify(task)},{provider:'codex',host:hostname(),pid:process.pid,fingerprint:processFingerprint(process.pid)},${JSON.stringify(planned)});process.exit(7);`;
  assert.throws(()=>execFileSync(process.execPath,["--input-type=module","-e",script],{stdio:"pipe",timeout:5000}),error=>(error as {status:number}).status===7);
  const tasks=new StartupTasks(receipts);
  let bindingDigest:string;
  try {const binding=tasks.owner(task);assert.ok(binding);bindingDigest=digest(binding);}finally{tasks.close();}
  assert.equal(generations.state().readers.length,0);
  const recovered=recoverStartupOwner(receipts,task,bindingDigest,"fixture:abrupt-exit",{workspace:root,registry});
  assert.equal(recovered.taskOutcome,"unknown");
  assert.deepEqual(recoverStartupOwner(receipts,task,bindingDigest,"fixture:replay",{workspace:root,registry}),recovered);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});

test("session closure between owner intent and acquisition prevents a new reservation",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-close-intent-"))),tasks=new StartupTasks(join(root,"tasks.sqlite"));
 try {
  const event={hook_event_name:"SessionStart",source:"startup",session_id:"closing"};
  const task=digest({provider:"codex",session:event.session_id,workspace:root});
  const host={provider:"codex" as const,host:"fixture",pid:42,fingerprint:"fixture"};
  const reader={registry:join(root,"registry.sqlite"),token:randomUUID(),revision:1,directory:root,owner:`startup-task:${task}`};
  tasks.event("codex",event,root,digest("lock"),{});tasks.bindOwner(task,host,reader);
  let calls=0;
  tasks.reserveOwner(task,{host,reader},()=>{calls++;});assert.equal(calls,1);
  tasks.event("codex",{...event,hook_event_name:"SessionEnd"},root,digest("lock"),{});
  assert.throws(()=>tasks.reserveOwner(task,{host,reader},()=>{calls++;}),/closed or changed/);
  assert.equal(calls,1);
 }finally{tasks.close();rmSync(root,{recursive:true,force:true});}
});
