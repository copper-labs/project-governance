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
