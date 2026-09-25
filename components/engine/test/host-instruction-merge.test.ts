import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {mergeHostInstructions,PREVIOUS_LEGACY_STARTUP_BLOCK,LEGACY_STARTUP_BLOCK,PREVIOUS_COMPILED_STARTUP_BLOCK,COMPILED_STARTUP_BLOCK} from "../src/host-instruction-merge.ts";
import {COMPILED_HOST_BLOCK} from "../src/provider-guidance.ts";
import {installHostInstructions} from "../src/host-instruction-installation.ts";

test("compiled host migration recognizes the actual wheel startup block and preserves authored surroundings",()=>{
 const actual=execFileSync("python3",["-c","import sys;sys.path.insert(0,'src');from project_governance_runtime.startup_integration import BLOCK;print(BLOCK,end='')"],{encoding:"utf8"});
 assert.equal(LEGACY_STARTUP_BLOCK,actual);
 const original=`Before\r\n${PREVIOUS_LEGACY_STARTUP_BLOCK}\r\nAfter\n`;
 const merged=mergeHostInstructions(original,COMPILED_HOST_BLOCK);
 assert.equal(merged,`${COMPILED_HOST_BLOCK}\n\nBefore\r\n${COMPILED_STARTUP_BLOCK}\r\nAfter\n`);
 assert.equal(mergeHostInstructions(merged,COMPILED_HOST_BLOCK),merged);
 assert.equal(mergeHostInstructions(LEGACY_STARTUP_BLOCK,COMPILED_HOST_BLOCK),
  `${COMPILED_HOST_BLOCK}\n\n${COMPILED_STARTUP_BLOCK}`);
 assert.equal(mergeHostInstructions(PREVIOUS_COMPILED_STARTUP_BLOCK,COMPILED_HOST_BLOCK),
  `${COMPILED_HOST_BLOCK}\n\n${COMPILED_STARTUP_BLOCK}`);
 assert.throws(()=>mergeHostInstructions(original.replace("Minor work","Customized work"),COMPILED_HOST_BLOCK),/Customized/);
 assert.throws(()=>mergeHostInstructions(actual+actual,COMPILED_HOST_BLOCK),/Malformed/);
});
test("host installer migrates known startup routes and refuses custom routes before writing any host file",()=>{
 const root=mkdtempSync(join(tmpdir(),"host-startup-migration-"));
 try{
  writeFileSync(join(root,"AGENTS.md"),PREVIOUS_LEGACY_STARTUP_BLOCK+"\nAuthored instructions.");
  const customized=PREVIOUS_LEGACY_STARTUP_BLOCK.replace("Minor work","My work");writeFileSync(join(root,"CLAUDE.md"),customized);
  assert.throws(()=>installHostInstructions(root,COMPILED_HOST_BLOCK),/Customized/);
  assert.equal(readFileSync(join(root,"AGENTS.md"),"utf8"),PREVIOUS_LEGACY_STARTUP_BLOCK+"\nAuthored instructions.");
  writeFileSync(join(root,"CLAUDE.md"),LEGACY_STARTUP_BLOCK);
  installHostInstructions(root,COMPILED_HOST_BLOCK);
  assert.match(readFileSync(join(root,"AGENTS.md"),"utf8"),/Read the repository-local.*startup-help.*only when/);
  assert.ok(readFileSync(join(root,"AGENTS.md"),"utf8").endsWith("\nAuthored instructions."));
  assert.equal(installHostInstructions(root,COMPILED_HOST_BLOCK).state,"unchanged");
 }finally{rmSync(root,{recursive:true,force:true});}
});
