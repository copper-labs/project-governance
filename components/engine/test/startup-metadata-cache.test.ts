import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {discoverStartupRelease} from "../src/startup-discovery.ts";
const lock=(version="3.0.0")=>({schema_version:2,package:"@organta/project-governance",version,artifact:{url:`https://github.com/example/governance/releases/download/${version}/runtime.tgz`,integrity:"sha512-"+Buffer.alloc(64).toString("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1});
const profile={runtime_updates:{policy:"compatible",cache_seconds:60}};
test("startup metadata cache avoids repeated requests but expires and binds lock and policy",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-cache-"))),cachePath=join(root,"metadata.json");let calls=0;
 const fetcher=(async()=>{calls++;return new Response("[]");}) as typeof fetch;
 try{
  const options={fetch:fetcher,cachePath,token:"private-token-do-not-store"};
  assert.equal((await discoverStartupRelease(profile,lock(),options)).status,"current");assert.equal(calls,1);
  assert.equal((await discoverStartupRelease(profile,lock(),options)).status,"current");assert.equal(calls,1);
  assert.doesNotMatch(readFileSync(cachePath,"utf8"),/private-token/);
  const prior=JSON.parse(readFileSync(cachePath,"utf8"));prior.createdAt-=61000;writeFileSync(cachePath,JSON.stringify(prior));
  await discoverStartupRelease(profile,lock(),options);assert.equal(calls,2);
  await discoverStartupRelease(profile,lock("3.0.1"),options);assert.equal(calls,3);
  await discoverStartupRelease({runtime_updates:{policy:"compatible",cache_seconds:30}},lock("3.0.1"),options);assert.equal(calls,4);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("manual and failed discovery never create a cache; corrupted data is revalidated",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-cache-failure-"))),cachePath=join(root,"metadata.json");let calls=0;
 const fetcher=(async()=>{calls++;return new Response("[]");}) as typeof fetch;
 try{
  await discoverStartupRelease({},lock(),{cachePath,fetch:fetcher});assert.equal(calls,0);assert.equal(existsSync(cachePath),false);
  await assert.rejects(discoverStartupRelease(profile,lock(),{cachePath,fetch:(async()=>new Response("bad")) as typeof fetch}));
  assert.equal(existsSync(cachePath),false);
  await discoverStartupRelease(profile,lock(),{cachePath,fetch:fetcher});
  const value=JSON.parse(readFileSync(cachePath,"utf8"));
  value.responses[Object.keys(value.responses)[0]!]=Buffer.from('{"not":"an inventory"}').toString("base64");
  writeFileSync(cachePath,JSON.stringify(value));
  await assert.rejects(discoverStartupRelease(profile,lock(),{cachePath,fetch:fetcher}));assert.equal(calls,1);
  rmSync(cachePath);symlinkSync(join(root,"missing"),cachePath);
  await assert.rejects(discoverStartupRelease(profile,lock(),{cachePath,fetch:fetcher}),/ordinary/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
