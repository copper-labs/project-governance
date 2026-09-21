import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync,readFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {StartupTasks} from "../src/startup-tasks.ts";
import {startupCommand} from "../src/startup-command.ts";
import {startupStatus} from "../src/startup-status.ts";
import {digest} from "../src/core.ts";

test("startup status exposes exact recovery binding without modifying receipts",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-status-"))),path=join(root,"tasks.sqlite");
 try {
  const store=new StartupTasks(path);
  const task=store.event("codex",{session_id:"status",hook_event_name:"SessionStart",source:"startup"},root,"sha256:"+"a".repeat(64),{});
  assert.ok("taskId" in task);
  const binding={host:{host:"fixture",pid:123,provider:"codex" as const,fingerprint:"start"},
   reader:{registry:path,token:"reader",owner:`startup-task:${task.taskId}`,revision:1,directory:root}};
  store.bindOwner(task.taskId,binding.host,binding.reader);store.close();
  const before=readFileSync(path),scope={workspace:root,registry:path};
  const status=await startupCommand(["status","--task",task.taskId,"--receipts",path],scope) as ReturnType<typeof startupStatus>;
  assert.equal(status.bindingDigest,digest(binding));assert.deepEqual(status.owner,binding);
  assert.equal(status.state,"open");assert.equal(status.recovery,"requires-positive-host-absence");
  assert.deepEqual(readFileSync(path),before);
  assert.throws(()=>startupStatus(path,task.taskId,{...scope,workspace:tmpdir()}),/workspace differs/);
  assert.throws(()=>startupStatus(path,task.taskId,{...scope,registry:root}),/registry differs/);
  assert.throws(()=>startupStatus(join(root,"missing.sqlite"),task.taskId,scope));
  assert.equal(existsSync(join(root,"missing.sqlite")),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("startup status reads older receipt protocol without migrating it",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-status-old-"))),path=join(root,"tasks.sqlite");
 try {
  const id="sha256:"+"b".repeat(64),db=new DatabaseSync(path);
  db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, root TEXT, lock_digest TEXT, state TEXT, discovery TEXT, result TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO tasks VALUES(?,?,?,'closed','not-requested',NULL)").run(id,root,id);db.close();
  const before=readFileSync(path),status=startupStatus(path,id,{workspace:root,registry:path});
  assert.equal(status.owner,null);assert.equal(status.bindingDigest,null);
  assert.equal(status.recovery,"no-recorded-owner");assert.deepEqual(readFileSync(path),before);
 }finally{rmSync(root,{recursive:true,force:true});}
});
