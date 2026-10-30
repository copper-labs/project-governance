import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync,writeFileSync,existsSync } from "node:fs";
import { api,moduleUrl,ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {recoverCommandOwner}=await import(moduleUrl("command-owner-recovery"));
const {recoverStoppedWorkflow}=await import(moduleUrl("workflow-worker-recovery"));
const {workflowResourceRelease}=await import(moduleUrl("workflow-resource-release"));
const cli=process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url));

/** Controlled uncertain cleanup after a real failed native fixture, then the normal qualified recovery path. */
async function fixture(reason="exit",missingExit=false){
 const f=await ownerReleaseFixture(),path=join(f.command,"result.json"),raw=JSON.parse(readFileSync(path,"utf8"));
 raw.state="unknown";raw.cleanup="unknown";raw.reason=reason;if(missingExit){delete raw.exitCode;delete raw.signal;}writeFileSync(path,JSON.stringify(raw));
 const db=new DatabaseSync(f.database),stage=f.store.stages(f.run.id)[0];
 db.prepare("UPDATE engine_stage SET state='unknown',result=? WHERE run_id=? AND id=?").run(JSON.stringify({...stage.result,state:"unknown",cleanup:"unknown",detail:reason}),f.run.id,stage.id);db.close();
 recoverCommandOwner(f.command,raw.requestDigest,"host:fixture-owner");
 const recovered=await recoverStoppedWorkflow(f.worker,f.database,f.run.id,f.run.revision);
 f.args[f.args.indexOf("--revision")+1]=String(recovered.run.revision);
 return{...f,raw,path,recovered};
}
test("public recovered owner release permits a harmless successor while preserving raw failure evidence",async()=>{const f=await fixture();try{const raw=readFileSync(f.path),stage=f.store.stages(f.run.id)[0];assert.equal(stage.state,"failed");assert.equal(stage.result.cleanup,"confirmed");assert.equal(stage.result.exitCode,1);assert.ok(stage.result.cleanupRecovery);const result=spawnSync(process.execPath,[cli,"workflow-release-resources",...f.args],{cwd:f.dir,encoding:"utf8",timeout:15000});assert.equal(result.status,0,result.stderr);assert.equal(f.held().length,0);assert.deepEqual(readFileSync(f.path),raw);const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.deepEqual(receipt.observation.proof.commands[0].cleanupRecovery,stage.result.cleanupRecovery);const next=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.recovered.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});assert.equal(next.status,1,next.stderr);assert.equal(JSON.parse(next.stdout).run.state,"failed");assert.deepEqual(readFileSync(f.path),raw);
 const successor=await ownerReleaseFixture(["fixture-local-producer","fixture-local-storage"],false,0,{registryPath:f.registry.path});try{
  const previous=JSON.parse(readFileSync(f.receipt,"utf8")).leases,later=successor.registry.originalLeases(successor.run.id,successor.run.owner);assert.equal(later.length,previous.length);for(const lease of later)assert.equal(lease.generation,previous.find((x:any)=>x.resource===lease.resource).generation+1);
  const replayArgs=[...f.args];replayArgs[replayArgs.indexOf("--revision")+1]=String(f.store.read(f.run.id).revision);
  const replay=spawnSync(process.execPath,[cli,"workflow-release-resources",...replayArgs],{cwd:f.dir,encoding:"utf8",timeout:15000});assert.equal(replay.status,0,replay.stderr);for(const lease of later)successor.registry.assertHeld(lease);
  const released=spawnSync(process.execPath,[cli,"workflow-release-resources",...successor.args],{cwd:successor.dir,encoding:"utf8",timeout:15000});assert.equal(released.status,0,released.stderr);assert.equal(successor.held().length,0);
  const closed=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",successor.database,"--run",successor.run.id,"--revision",String(successor.run.revision),"--registry",successor.registry.path,"--receipt",successor.receipt,"--worker-directory",successor.worker],{cwd:successor.dir,encoding:"utf8",timeout:15000});assert.equal(closed.status,0,closed.stderr);assert.equal(JSON.parse(closed.stdout).run.state,"succeeded");assert.deepEqual(readFileSync(f.path),raw);assert.equal(f.store.read(f.run.id).state,"failed");
 }finally{successor.close();}}finally{f.close();}});
for(const change of ["recovery-digest","receipt-digest","missing-stage-binding","missing-recovery","native-mutation","wrong-request"]){test(`recovered owner evidence refuses ${change}`,async()=>{const f=await fixture();try{const stage=f.store.stages(f.run.id)[0];if(["recovery-digest","receipt-digest","missing-stage-binding"].includes(change)){const result=stage.result;if(change==="missing-stage-binding")delete result.cleanupRecovery;else result.cleanupRecovery[change==="recovery-digest"?"recoveryDigest":"receiptDigest"]="sha256:"+"0".repeat(64);const db=new DatabaseSync(f.database);db.prepare("UPDATE engine_stage SET result=? WHERE run_id=? AND id=?").run(JSON.stringify(result),f.run.id,stage.id);db.close();}else{const path=change==="native-mutation"?f.path:join(f.command,"owner-recovery.json");if(change==="missing-recovery")writeFileSync(path,"{}");else{const data=JSON.parse(readFileSync(path,"utf8"));if(change==="wrong-request")data.requestDigest="sha256:"+"0".repeat(64);else data.exitCode=0;writeFileSync(path,JSON.stringify(data));}}assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);assert.equal(existsSync(f.receipt),false);}finally{f.close();}});}
test("owner-loss cleanup never invents a known execution outcome",async()=>{const f=await fixture("owner-lost");try{assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);assert.equal(JSON.parse(readFileSync(f.path,"utf8")).state,"unknown");}finally{f.close();}});

for(const reason of ["exit","cancelled"]){test(`missing native exit/signal remains unknown for ${reason}`,async()=>{const f=await fixture(reason,true);try{assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);assert.equal(JSON.parse(readFileSync(f.path,"utf8")).state,"unknown");}finally{f.close();}});}
