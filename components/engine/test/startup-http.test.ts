import {test} from "node:test";
import assert from "node:assert/strict";
import {StartupHttp} from "../src/startup-http.ts";
const url="https://api.github.com/repos/example/governance/releases";
test("startup redirects strip credentials on authority changes",async()=>{
 const seen:Array<string|null>=[];
 const client=new StartupHttp("example/governance",5,{token:"private",fetch:(async(_url,init)=>{
  seen.push(new Headers(init?.headers).get("Authorization"));
  return seen.length===1?new Response(null,{status:302,headers:{location:"https://release-assets.githubusercontent.com/file"}}):new Response("[]");
 }) as typeof fetch});
 assert.deepEqual(await client.json(url),[]);assert.deepEqual(seen,["Bearer private",null]);
 await assert.rejects(client.read("https://api.github.com/repos/other/governance/releases"),/scope/);
});
test("startup HTTP rejects oversized bodies, unsafe redirects and failed responses",async()=>{
 for(const response of [()=>new Response("12345"),()=>new Response("x",{headers:{"content-length":"99"}}),()=>new Response(null,{status:302,headers:{location:"https://untrusted.invalid/file"}}),()=>new Response(null,{status:503})]) {
  const client=new StartupHttp("example/governance",5,{fetch:(async()=>response()) as typeof fetch});
  await assert.rejects(client.read(url,4));
 }
});
test("startup HTTP deadline aborts a pending request",async()=>{
 const client=new StartupHttp("example/governance",0.01,{fetch:((_url,init)=>new Promise((_resolve,reject)=>{
  if(init?.signal?.aborted)reject(new Error("aborted"));
  else init?.signal?.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});
 })) as typeof fetch});
 await assert.rejects(client.read(url),/aborted|deadline/);
 await assert.rejects(client.read(url),/deadline/);
});
