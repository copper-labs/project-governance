import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {discoverStartupRelease} from "../src/startup-discovery.ts";
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const lock=(version:string)=>({schema_version:2,package:"@organta/project-governance",version,artifact:{url:`https://github.com/example/governance/releases/download/${version}/runtime.tgz`,integrity:"sha512-"+Buffer.alloc(64).toString("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1});
const profile={runtime_updates:{policy:"compatible"}};
test("startup discovery composes published identities and never downloads the archive during discovery",async()=>{
 const candidate=lock("3.1.0"),lockBytes=Buffer.from(JSON.stringify(candidate));
 const meta=Buffer.from(JSON.stringify({schema_version:1,version:"3.1.0",lock_sha256:hash(lockBytes),startup_contract:2,automatic:true,from_version:"3.0.0",before_version:"3.1.0",configuration_schema:1,integration_change:false}));
 const bytes=[meta,lockBytes,Buffer.from("archive")],api="https://api.github.com/repos/example/governance";
 const release={immutable:true,draft:false,prerelease:false,tag_name:"3.1.0",assets:["runtime-update.json","runtime.lock.yaml","runtime.tgz"].map((name,index)=>({name,state:"uploaded",size:bytes[index]!.length,digest:`sha256:${hash(bytes[index]!)}`,url:`${api}/releases/assets/${index}`,browser_download_url:candidate.artifact.url}))};
 const calls:string[]=[];
 const fetcher=(async(input:URL|RequestInfo)=>{
  const url=String(input);calls.push(url);
  return new Response(url.includes("?per_page=")?JSON.stringify([{...release,tag_name:"3.2.0",immutable:false},release]):bytes[Number(url.split("/").at(-1))]);
 }) as typeof fetch;
 const result=await discoverStartupRelease(profile,lock("3.0.0"),{fetch:fetcher});
 assert.equal(result.status,"available");if(result.status==="available")assert.equal(result.refused[0]?.version,"3.2.0");assert.equal(calls.length,3);assert(!calls.some(url=>url.endsWith("/2")));
});
test("startup discovery distinguishes manual, current, major and failed discovery",async()=>{
 const never=(async()=>{throw new Error("must not fetch");}) as typeof fetch;
 assert.equal((await discoverStartupRelease({},lock("3.0.0"),{fetch:never})).status,"manual");
 assert.deepEqual(await discoverStartupRelease(profile,lock("3.0.0-rc.5"),{fetch:never}),{status:"manual",reason:"prerelease-runtime"});
 assert.deepEqual(await discoverStartupRelease(profile,{...lock("3.0.0"),artifact:{...lock("3.0.0").artifact,url:"file:///tmp/runtime.tgz"}},{fetch:never}),
  {status:"manual",reason:"unsupported-distribution"});
 assert.equal((await discoverStartupRelease(profile,lock("3.0.0"),{fetch:(async()=>new Response("[]")) as typeof fetch})).status,"current");
 const major=await discoverStartupRelease(profile,lock("3.0.0"),{fetch:(async()=>new Response(JSON.stringify([{tag_name:"4.0.0",draft:false,prerelease:false}]))) as typeof fetch});
 assert.equal(major.status,"approval-required");
 await assert.rejects(discoverStartupRelease(profile,lock("3.0.0"),{fetch:never}),/must not fetch/);
});

test("startup refuses all incompatible candidates without claiming current or fetching their assets",async()=>{
 let calls=0;
 const result=await discoverStartupRelease(profile,lock("3.0.0"),{fetch:(async()=>{
  calls++;return new Response(JSON.stringify(Array.from({length:6},(_,i)=>({tag_name:`3.${i+1}.0`,draft:false,prerelease:false,immutable:false}))));
 }) as typeof fetch});
 assert.equal(calls,1);assert.equal(result.status,"approval-required");
 if(result.status==="approval-required" && "refused" in result)assert.equal(result.refused.length,4);
});
