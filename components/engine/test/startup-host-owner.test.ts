import {test} from "node:test";
import assert from "node:assert/strict";
import {requireAbsentStartupHost,requireCurrentStartupHost} from "../src/startup-host-owner.ts";
test("startup recovery requires a recorded local owner and successful positive absence evidence",()=>{
 const owner={host:"fixture",provider:"codex" as const,pid:123,fingerprint:"recorded start"};
 assert.equal(requireAbsentStartupHost(owner,()=>[],"fixture").absent,true);
 assert.throws(()=>requireAbsentStartupHost(owner,()=>[{pid:123,parent:1,group:123}],"fixture"),/remains present/);
 assert.throws(()=>requireAbsentStartupHost(owner,()=>{throw new Error("enumeration failed");},"fixture"),/enumeration failed/);
 for(const invalid of [null,{...owner,host:"other"},{...owner,pid:0},{...owner,fingerprint:""}])
  assert.throws(()=>requireAbsentStartupHost(invalid,()=>[],"fixture"),/identity required/);
});
test("startup preparation requires the exact recorded native ancestor",()=>{
 const owner={host:"fixture",provider:"codex" as const,pid:123,fingerprint:"recorded start"};
 assert.deepEqual(requireCurrentStartupHost(owner,()=>({...owner})),owner);
 for(const observed of [null,{...owner,pid:124},{...owner,host:"another"},{...owner,fingerprint:"reused PID"}])
  assert.throws(()=>requireCurrentStartupHost(owner,()=>observed),/Current native host differs/);
 assert.throws(()=>requireCurrentStartupHost(null,()=>owner),/identity required/);
});

test("native ownership survives a host label change when both captured machine identities match",()=>{
 const machineId="machine:sha256:"+"a".repeat(64);
 const owner={host:"old-network-name",machineId,provider:"codex" as const,pid:123,fingerprint:"same-start"};
 const observed={...owner,host:"new-network-name.local"};
 assert.deepEqual(requireCurrentStartupHost(owner,()=>observed),observed);
 const {machineId:_id,...withoutIdentity}=observed;
 for(const invalid of [{...observed,machineId:"machine:sha256:"+"b".repeat(64)},
   withoutIdentity,{...observed,pid:124},{...observed,fingerprint:"reused-pid"}])
  assert.throws(()=>requireCurrentStartupHost(owner,()=>invalid),/Current native host differs/);
});

test("machine-bound absence still requires exact local machine and positive PID absence",()=>{
 const machineId="machine:sha256:"+"a".repeat(64);
 const owner={host:"old-label",machineId,provider:"codex" as const,pid:123,fingerprint:"recorded"};
 assert.equal(requireAbsentStartupHost(owner,()=>[],"new-label",machineId).absent,true);
 assert.throws(()=>requireAbsentStartupHost(owner,()=>[],"old-label","machine:sha256:"+"b".repeat(64)),/identity required/);
 assert.throws(()=>requireAbsentStartupHost(owner,()=>[],"old-label",null),/identity required/);
 assert.throws(()=>requireAbsentStartupHost(owner,()=>[{pid:123,parent:1,group:123}],"new-label",machineId),/remains present/);
});
