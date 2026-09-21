import {test} from "node:test";
import assert from "node:assert/strict";
import {startupPolicy,startupWorkAssessment} from "../src/startup-policy.ts";

test("startup is manual by default and preserves bounded repository settings",()=>{
 assert.deepEqual(startupPolicy({}),{policy:"manual",cache_seconds:43200,discovery_seconds:5,install_seconds:180});
 assert.equal(startupPolicy({runtime_updates:{policy:"compatible",discovery_seconds:0.5}}).discovery_seconds,0.5);
 for(const value of [null,[],{policy:null},{policy:"always"},{unknown:true},{discovery_seconds:0},{discovery_seconds:61},{install_seconds:true},{cache_seconds:Infinity},{install_seconds:null}])
  assert.throws(()=>startupPolicy({runtime_updates:value}));
});
test("work assessment defers protected work and never establishes complete update authority",()=>{
 const profile={runtime_updates:{policy:"compatible"}};
 for(const state of ["substantial-plan","review","read-only"])
  assert.equal(startupWorkAssessment(profile,state,"Existing work").eligible,false);
 for(const state of ["not-started","minor"]) {
  assert.equal(startupWorkAssessment({},state,"Existing work").eligible,false);
  assert.equal(startupWorkAssessment(profile,state,"Existing work").reason,"requires-host-release-and-worktree-validation");
 }
 assert.throws(()=>startupWorkAssessment(profile,"unknown","reason"));
 assert.throws(()=>startupWorkAssessment(profile,"minor"," "));
 assert.throws(()=>startupWorkAssessment(profile,"minor","x".repeat(1001)));
});
