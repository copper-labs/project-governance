import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {startupDeadline} from "../src/startup-deadline.ts";
import {OperationDeadline} from "../src/operation-deadline.ts";
import {stageRuntimeOperation} from "../src/runtime-stage-operation.ts";

test("startup deadline is reused without renewal and refuses changed or expired budgets",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-budget-"))),request="sha256:"+"a".repeat(64);
 try {
  const deadline=startupDeadline(root,request,60,true),path=join(root,"deadline.json"),original=readFileSync(path);
  assert.ok(deadline.remaining()<=60000);assert.equal(deadline.remaining(100),100);
  assert.equal(startupDeadline(root,request,60).expiresAt,deadline.expiresAt);
  assert.deepEqual(readFileSync(path),original);
  assert.throws(()=>startupDeadline(root,request,60,true),/already reserved/);
  assert.throws(()=>startupDeadline(root,request,61),/identity differs/);
  assert.throws(()=>startupDeadline(root,"sha256:"+"b".repeat(64),60),/identity differs/);
  const saved=JSON.parse(original.toString()),startedAt=Date.now()-61000;
  writeFileSync(path,JSON.stringify({...saved,startedAt,expiresAt:startedAt+60000}));
  assert.throws(()=>startupDeadline(root,request,60),/deadline expired/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("expired staging has no filesystem effects and clock rollback cannot renew an in-process budget",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"expired-staging-")));
 try {
  const expired=new OperationDeadline(Date.now()-1),destination=join(root,"stage");
  assert.throws(()=>stageRuntimeOperation(join(root,"missing.tgz"),{} as never,destination,expired),/deadline expired/);
  assert.equal(existsSync(destination),false);
  const deadline=new OperationDeadline(Date.now()+10000),before=deadline.remaining(),now=Date.now;
  try {Date.now=()=>now()-60000;assert.ok(deadline.remaining()<=before);}finally{Date.now=now;}
 }finally{rmSync(root,{recursive:true,force:true});}

});
