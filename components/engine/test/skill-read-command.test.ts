import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {skillReadCommand} from "../src/skill-read-command.ts";

test("packaged guidance reads exact bounded content and refuses traversal or aliases",()=>{
 const root=mkdtempSync(join(tmpdir(),"skill-read-"));
 try {
  const content="name: fixture\n";writeFileSync(join(root,"catalog.yaml"),content);
  const result=skillReadCommand(["--path","catalog.yaml"],root);
  assert.equal(result.content,content);assert.equal(result.bytes,Buffer.byteLength(content));
  assert.equal(result.sourceDigest,'sha256:'+createHash('sha256').update(content).digest('hex'));
  assert.throws(()=>skillReadCommand(["--path","../catalog.yaml"],root),/unsafe/);
  symlinkSync(join(root,"catalog.yaml"),join(root,"alias.yaml"));
  assert.throws(()=>skillReadCommand(["--path","alias.yaml"],root),/aliases/);
  writeFileSync(join(root,"large.md"),'x'.repeat(65537));
  assert.throws(()=>skillReadCommand(["--path","large.md"],root),/64 KiB/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
