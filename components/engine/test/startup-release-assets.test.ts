import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {startupReleaseCandidate,downloadStartupArchive} from "../src/startup-release-assets.ts";
import {stageStartupArchive} from "../src/startup-archive.ts";
import {mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function fixture() {
 const api="https://api.github.com/repos/example/governance";
 const lock=(version:string)=>({schema_version:2,package:"@organta/project-governance",version,artifact:{url:`https://github.com/example/governance/releases/download/${version}/runtime.tgz`,integrity:"sha512-"+Buffer.alloc(64).toString("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1});
 const current=lock("3.0.0"),candidate=lock("3.1.0");
 candidate.artifact.integrity="sha512-"+createHash("sha512").update("archive").digest("base64");
 const lockBytes=Buffer.from(JSON.stringify(candidate));
 const metadata=Buffer.from(JSON.stringify({schema_version:1,version:"3.1.0",lock_sha256:hash(lockBytes),startup_contract:2,automatic:true,from_version:"3.0.0",before_version:"3.1.0",configuration_schema:1,integration_change:false}));
 const bytes=[metadata,lockBytes,Buffer.from("archive")];
 const assets=["runtime-update.json","runtime.lock.yaml","runtime.tgz"].map((name,index)=>({name,state:"uploaded",size:bytes[index]!.length,digest:`sha256:${hash(bytes[index]!)}`,url:`${api}/releases/assets/${index}`,browser_download_url:candidate.artifact.url}));
 return {current,release:{immutable:true,draft:false,prerelease:false,tag_name:"3.1.0",assets},client:{api,read:async(url:string)=>bytes[Number(url.split("/").at(-1))]!}};
}
test("startup candidate binds immutable asset bytes without claiming archive verification",async()=>{
 const f=fixture(),result=await startupReleaseCandidate(f.current,f.release,f.client);
 assert.equal(result.lock.version,"3.1.0");assert.equal(result.archiveVerification,"required-before-installation");
 for(const patch of [{immutable:false},{tag_name:"3.2.0"},{assets:[...f.release.assets,f.release.assets[0]]}])
  await assert.rejects(startupReleaseCandidate(f.current,{...f.release,...patch},f.client));
 await assert.rejects(startupReleaseCandidate(f.current,f.release,{...f.client,read:async()=>Buffer.from("changed")}));
 const other=fixture();other.release.assets[2]!.browser_download_url="https://github.com/other/governance/releases/download/3.1.0/runtime.tgz";
 await assert.rejects(startupReleaseCandidate(other.current,other.release,other.client),/different release/);
});
test("startup archive verifies published size and digest plus the lock integrity",async()=>{
 const f=fixture(),calls:string[]=[];
 const downloaded=await downloadStartupArchive(f.current,f.release,{...f.client,read:async(url,limit,asset)=>{
  calls.push(url);assert.equal(asset,true);
  if(url.endsWith("/2"))assert.equal(limit,7);
  return f.client.read(url);
 }});
 assert.equal(Buffer.from(downloaded.bytes).toString(),"archive");
 assert.equal(downloaded.authority,"verified-download-only");assert.equal(calls.length,3);
 await assert.rejects(downloadStartupArchive(f.current,f.release,{...f.client,read:async(url)=>url.endsWith("/2")?Buffer.from("changed"):f.client.read(url)}),/published asset/);
 const oversized=fixture();oversized.release.assets[2]!.size=16*1024*1024+1;
 await assert.rejects(downloadStartupArchive(oversized.current,oversized.release,oversized.client),/download limit/);
 const different=fixture(),replacement=Buffer.from("another");
 different.release.assets[2]!.digest=`sha256:${hash(replacement)}`;
 await assert.rejects(downloadStartupArchive(different.current,different.release,{...different.client,read:async(url)=>url.endsWith("/2")?replacement:different.client.read(url)}),/pinned integrity/);
});
test("startup archive staging reuses exact bytes and preserves conflicting files",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-archive-"))),f=fixture();
 try {
  const staged=await stageStartupArchive(root,f.current,f.release,f.client);
  assert.equal(readFileSync(staged.path,"utf8"),"archive");
  assert.equal(staged.authority,"staged-archive-only");
  assert.deepEqual(await stageStartupArchive(root,f.current,f.release,f.client),staged);
  assert.equal(readdirSync(root).length,1);
  writeFileSync(staged.path,"changed");
  await assert.rejects(stageStartupArchive(root,f.current,f.release,f.client),/Existing startup archive differs/);
  assert.equal(readFileSync(staged.path,"utf8"),"changed");
  assert.equal(readdirSync(root).length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
