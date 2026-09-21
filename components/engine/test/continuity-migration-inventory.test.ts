import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,existsSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {Store} from "../../harness/src/store/store.ts";
import {defaultDbPath} from "../../harness/src/store/location.ts";
import {continuityMigrationInventory} from "../src/continuity-migration-inventory.ts";

test("migration inventory reads continuity without creating, migrating or settling it",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"continuity-inventory-")));
 try {
  execFileSync("git",["init","-q"],{cwd:root});
  const path=defaultDbPath(root);
  assert.equal(continuityMigrationInventory(root).state,"absent");assert.equal(existsSync(path),false);
  const store=new Store(path);const task=store.createTask("keep history",[{kind:"scope",provenance:"operator",body:root}],{worktree:root,branch:null});
  const other=store.createTask("other worktree",[],{worktree:join(root,"other"),branch:null});
  for(const [id,taskId] of [["pending-local",task.taskId],["pending-other",other.taskId]])store.insertAction({actionId:id!,taskId:taskId!,taskVersion:1,operation:"check",scope:[root],destination:null,policyRevision:"fixture",status:"prepared",expectedInputs:[],intendedOutputs:[],reconcile:null,refusedReason:null});
  store.close();
  const database=new DatabaseSync(path);
  try {
   const initial=continuityMigrationInventory(root);
   assert.equal(initial.state,"inspected");assert.equal(initial.tasks,1);assert.equal(initial.executionDrain,"unresolved");
   assert.deepEqual(initial.unresolved?.map(row=>row.actionId),["pending-local"]);
   assert.equal(initial.unresolved?.[0]?.jobId,null);
   assert.equal(database.prepare("SELECT status FROM action WHERE action_id='pending-local'").get()?.status,"prepared");
   // Old supported schemas are observed, not upgraded by discovery.
   database.prepare("UPDATE meta SET value='5' WHERE key='schema_version'").run();
   assert.equal(continuityMigrationInventory(root).schema,5);
   assert.equal(database.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value,"5");
   database.prepare("UPDATE meta SET value='99' WHERE key='schema_version'").run();
   assert.throws(()=>continuityMigrationInventory(root),/Unsupported continuity schema/);
   assert.equal(database.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value,"99");
   assert.ok(task.taskId);
  }finally{database.close();}
 }finally{rmSync(root,{recursive:true,force:true});}
});
