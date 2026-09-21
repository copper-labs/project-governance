import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const {readBootstrapArchive}=await import(new URL("../scripts/bootstrap-runtime.mjs",import.meta.url).href);

test("bootstrap invoked through an alias executes validation instead of silently exiting zero",()=>{
 const root=mkdtempSync(join(tmpdir(),"bootstrap-alias-"));
 try {
  const alias=join(root,"entry.mjs");symlinkSync(fileURLToPath(new URL("../scripts/bootstrap-runtime.mjs",import.meta.url)),alias);
  const result=spawnSync(process.execPath,[alias],{encoding:"utf8",timeout:5000});
  assert.equal(result.status,1);assert.match(result.stderr,/Workspace and external state directory required/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("private bootstrap resolves the exact asset and drops credentials at the signed download redirect",async()=>{
 const url="https://github.com/example/runtime/releases/download/v3.0.0/runtime.tgz";
 const calls:{url:string;authorization:string|null}[]=[];
 const transport=async(input:URL,options:RequestInit)=>{
  calls.push({url:String(input),authorization:new Headers(options.headers).get("Authorization")});
  if(calls.length===1)return Response.json({assets:[{name:"runtime.tgz",id:42,browser_download_url:url}]});
  if(calls.length===2)return new Response(null,{status:302,headers:{location:"https://release-assets.githubusercontent.com/exact?signature=private"}});
  return new Response("archive");
 };
 assert.equal((await readBootstrapArchive(url,{fetch:transport,token:"fixture-token"})).toString(),"archive");
 assert.deepEqual(calls.map(call=>call.authorization),["Bearer fixture-token","Bearer fixture-token",null]);
 assert.equal(calls[1]!.url,"https://api.github.com/repos/example/runtime/releases/assets/42");
});
test("public bootstrap never sends GitHub credentials to another artifact authority",async()=>{
 let authorization:string|null="unchecked";
 await readBootstrapArchive("https://artifacts.example/runtime.tgz",{token:"fixture-token",fetch:async(_url:URL,options:RequestInit)=>{
  authorization=new Headers(options.headers).get("Authorization");return new Response("archive");
 }});
 assert.equal(authorization,null);
});
test("bootstrap refuses unsafe URLs, oversized bodies and mismatched private asset identity",async()=>{
 let calls=0;
 const fetch=async()=>{calls++;return new Response("body");};
 await assert.rejects(readBootstrapArchive("https://user:secret@example.com/runtime.tgz",{fetch}),/Invalid/);
 await assert.rejects(readBootstrapArchive("http://example.com/runtime.tgz",{fetch}),/HTTPS/);
 assert.equal(calls,0);
 await assert.rejects(readBootstrapArchive("https://example.com/runtime.tgz",{fetch:async()=>new Response("body",{headers:{"content-length":"999999999"}})}),/exceeds limit/);
 await assert.rejects(readBootstrapArchive("https://github.com/example/runtime/releases/download/v3/runtime.tgz",{token:"fixture",fetch:async()=>Response.json({assets:[{name:"runtime.tgz",id:42,browser_download_url:"https://other.example/runtime.tgz"}]})}),/identity differs/);
 await assert.rejects(readBootstrapArchive("https://example.com/runtime.tgz",{fetch:async()=>new Response(null,{status:302,headers:{location:"http://example.com/plain"}})}),/Unsafe/);
});
