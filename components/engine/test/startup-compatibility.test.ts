import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {compatibleStartupCandidate,stableStartupVersion} from "../src/startup-compatibility.ts";
const lock=(version:string)=>({schema_version:2,package:"@organta/project-governance",version,
 artifact:{url:`https://github.com/example/governance/releases/download/${version}/runtime.tgz`,integrity:"sha512-"+Buffer.alloc(64).toString("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1});
const current=lock("3.2.0"),candidate=lock("3.10.0"),bytes=Buffer.from(JSON.stringify(candidate));
const metadata={schema_version:1,version:candidate.version,lock_sha256:createHash("sha256").update(bytes).digest("hex"),startup_contract:2,automatic:true,from_version:"3.0.0",before_version:"3.3.0",configuration_schema:1,integration_change:false};
test("compiled startup compatibility binds exact bytes and numeric source ranges",()=>{
 assert.deepEqual(compatibleStartupCandidate(current,bytes,metadata),candidate);
 for(const patch of [{startup_contract:1},{automatic:false},{integration_change:true},{from_version:"3.2.1"},{before_version:"3.2.0"},{lock_sha256:"0".repeat(64)},{version:"3.9.0"},{configuration_schema:2},{extra:true}])
  assert.throws(()=>compatibleStartupCandidate(current,bytes,{...metadata,...patch}));
 assert.throws(()=>compatibleStartupCandidate(current,Buffer.from(JSON.stringify(candidate)+"\n"),metadata));
});
test("startup refuses major changes, downgrades, previews and distribution substitution",()=>{
 for(const version of ["4.0.0","3.1.9","3.2.0","3.3.0-preview.1"]) {
  const proposed=lock(version),raw=Buffer.from(JSON.stringify(proposed));
  assert.throws(()=>compatibleStartupCandidate(current,raw,{...metadata,version,lock_sha256:createHash("sha256").update(raw).digest("hex")}));
 }
 for(const url of [candidate.artifact.url.replace("example/","other/"),"file:///tmp/runtime.tgz",candidate.artifact.url.replace("3.10.0/","3.9.0/")]) {
  const raw=Buffer.from(JSON.stringify({...candidate,artifact:{...candidate.artifact,url}}));
  assert.throws(()=>compatibleStartupCandidate(current,raw,{...metadata,lock_sha256:createHash("sha256").update(raw).digest("hex")}));
 }
 for(const version of ["03.0.0","3.0","3.0.0+build","1000000000.0.0"])assert.throws(()=>stableStartupVersion(version));
});
