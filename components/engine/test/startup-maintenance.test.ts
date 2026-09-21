import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {RuntimeGenerations} from "../src/runtime-generations.ts";

test("startup reservation hands off atomically and replays only its exact ownership",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-maintenance-"))),path=join(root,"registry.sqlite");
 let generations=new RuntimeGenerations(path);generations.close();
 // This test isolates registry ownership. Installation identity is proved by the lifecycle fixture.
 const db=new DatabaseSync(path);db.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root);db.close();
 generations=new RuntimeGenerations(path);
 try {
  const reader=generations.reserveStartupTask("sha256:"+"a".repeat(64)),other=generations.acquire("other-task"),token=randomUUID();
  assert.throws(()=>generations.beginStartupMaintenance(reader,token),/sole recorded parent/);
  assert.equal(generations.state().readers.length,2);assert.equal(generations.state().maintenance,null);
  generations.release(other.token,other.owner);
  assert.throws(()=>generations.beginStartupMaintenance({...reader,token:"wrong"},token),/sole recorded parent/);
  const maintenance=generations.beginStartupMaintenance(reader,token);
  assert.equal(generations.retireStartupReader(reader),false);
  assert.equal(generations.state().maintenance?.token,token);
  assert.equal(generations.state().readers.length,0);
  assert.throws(()=>generations.acquire("late-task"),/admission stopped/);
  generations.close();generations=new RuntimeGenerations(path);
  assert.deepEqual(generations.beginStartupMaintenance(reader,token),maintenance);
  assert.throws(()=>generations.beginStartupMaintenance({...reader,token:"wrong"},token),/already owned/);
  assert.throws(()=>generations.beginStartupMaintenance(reader,randomUUID()),/already owned/);
  assert.throws(()=>generations.beginStartupMaintenance({...reader,revision:2},token),/generation changed/);
  assert.throws(()=>generations.cancelStartupMaintenance(reader,randomUUID()),/exact drained/);
  assert.deepEqual(generations.cancelStartupMaintenance(reader,token),reader);
  assert.equal(generations.state().maintenance,null);assert.equal(generations.state().readers.length,1);
  assert.deepEqual(generations.cancelStartupMaintenance(reader,token),reader);
  assert.equal(generations.state().readers.length,1);
  assert.throws(()=>generations.beginStartupMaintenance(reader,token),/already owned or finalized/);
  const retry=randomUUID();generations.beginStartupMaintenance(reader,retry);
  generations.requireCompletion(retry,maintenance.owner,"hostInstructionsDigest","incomplete-host-change");
  assert.throws(()=>generations.cancelStartupMaintenance(reader,retry),/Host instruction completion/);
  assert.equal(generations.state().readers.length,0);assert.equal(generations.state().maintenance?.token,retry);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});

test("startup completion preserves hook writes and restores the successor reservation once",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-finish-"))),path=join(root,"registry.sqlite");
 let generations=new RuntimeGenerations(path);generations.close();
 const seed=new DatabaseSync(path);seed.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root);seed.close();
 generations=new RuntimeGenerations(path);
 try {
  const reader=generations.reserveStartupTask("sha256:"+"b".repeat(64)),token=randomUUID();
  generations.beginStartupMaintenance(reader,token);
  const receipt={lockDigest:"sha256:"+"c".repeat(64),readback:"project-governance 3.1.0",workspace:root,commit:"d".repeat(40)};
  assert.throws(()=>generations.finishStartupMaintenance(reader,token,receipt),/successor generation/);
  // Simulate an already validated successor whose hooks wrote evidence; no installation claim here.
  const db=new DatabaseSync(path);db.prepare("UPDATE current SET revision=2,previous=directory,directory=?,written=1 WHERE id=1").run(join(root,"successor"));db.close();
  const hook=generations.acquire("hook",token);
  assert.throws(()=>generations.finishStartupMaintenance(reader,token,receipt),/drained maintenance/);
  generations.release(hook.token,hook.owner);
  const finished=generations.finishStartupMaintenance(reader,token,receipt);
  assert.equal(finished.state.written,true);assert.equal(finished.state.maintenance,null);
  assert.equal(finished.reader.revision,2);assert.equal(finished.state.readers.length,1);
  const repeated=generations.finishStartupMaintenance(reader,token,receipt);
  assert.equal(repeated.replayed,true);assert.equal(repeated.state.readers.length,1);
  assert.throws(()=>generations.finishStartupMaintenance(reader,token,{...receipt,commit:"e".repeat(40)}),/receipt differs/);
  assert.throws(()=>generations.rollback(2),/Rollback unavailable/);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});
