import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,rmSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {withStartupUpdateOwner,requireStoppedStartupUpdater} from "../src/startup-update-owner.ts";

const journal=(directory:string)=>({directory,requestDigest:"sha256:"+"a".repeat(64),token:randomUUID()});
test("startup updater claims once and records quiescence even when application fails",async()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),"startup-owner-"))),request=journal(directory);
 try {
  await assert.rejects(withStartupUpdateOwner(request,async()=>{
   assert.throws(()=>requireStoppedStartupUpdater(request),/PID remains present/);
   await assert.rejects(withStartupUpdateOwner(request,async()=>assert.fail("duplicate mutation")),/EEXIST/);
   throw new Error("fixture failure");
  }),/fixture failure/);
  assert.equal(requireStoppedStartupUpdater(request).proof,"coordinator-returned");
  await assert.rejects(withStartupUpdateOwner(request,async()=>assert.fail("repeat mutation")),/EEXIST/);
  assert.throws(()=>requireStoppedStartupUpdater({...request,token:randomUUID()}),/ownership differs/);
  const receipt=join(directory,"updater/stopped.json"),saved=JSON.parse(readFileSync(receipt,"utf8"));
  writeFileSync(receipt,JSON.stringify({...saved,ownerDigest:"wrong"}));
  assert.throws(()=>requireStoppedStartupUpdater(request),/stop receipt differs/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test("startup updater process loss requires complete local ownership and real process absence",async()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),"startup-owner-exit-"))),request=journal(directory);
 try {
  const module=new URL("../src/startup-update-owner.ts",import.meta.url).href;
  const child=spawn(process.execPath,["--input-type=module","-e",`import {withStartupUpdateOwner} from ${JSON.stringify(module)};
   await withStartupUpdateOwner(${JSON.stringify(request)},async()=>{process.exit(7);});`],{stdio:["ignore","ignore","pipe"]});
  let stderr="";child.stderr.on("data",bytes=>{stderr+=bytes;});
  const [code]=await once(child,"close");assert.equal(code,7,stderr);
  assert.equal(requireStoppedStartupUpdater(request).proof,"local-process-absent");
  const path=join(directory,"updater/owner.json"),owner=JSON.parse(readFileSync(path,"utf8"));
  writeFileSync(path,JSON.stringify({...owner,host:owner.host+"-other"}));
  assert.throws(()=>requireStoppedStartupUpdater(request),/ownership differs/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test("incomplete startup claims cannot be replaced or treated as stopped",async()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),"startup-owner-partial-"))),request=journal(directory);
 try {
  mkdirSync(join(directory,"updater"));
  assert.throws(()=>requireStoppedStartupUpdater(request));
  await assert.rejects(withStartupUpdateOwner(request,async()=>assert.fail("incomplete claim takeover")),/EEXIST/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
