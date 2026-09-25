import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,statSync,rmSync,symlinkSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startupCommand} from "../src/startup-command.ts";

test("explicit startup installation preserves authored hooks, mode and repeat bytes without update opt-in",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-install-")));
 try{
  mkdirSync(join(root,".codex"));
  const path=join(root,".codex/hooks.json"),scope={workspace:root,registry:join(root,"registry.sqlite")},receipts=join(root,"startup.sqlite");
  const original={hooks:{SessionStart:[{hooks:[{type:"command",command:"authored",timeout:2}]}]},custom:true};
  writeFileSync(path,JSON.stringify(original),{mode:0o640});
  const result=await startupCommand(["install-hooks","--receipts",receipts],scope) as {changed:boolean;updatePolicyChanged:boolean};
  assert.equal(result.changed,true);assert.equal(result.updatePolicyChanged,false);
  const bytes=readFileSync(path,"utf8"),after=JSON.parse(bytes);
  assert.deepEqual(after.hooks.SessionStart[0],original.hooks.SessionStart[0]);assert.equal(after.custom,true);
  assert.equal(statSync(path).mode&0o777,0o640);
  assert.equal((await startupCommand(["install-hooks","--receipts",receipts],scope) as {changed:boolean}).changed,false);
  assert.equal(readFileSync(path,"utf8"),bytes);assert.deepEqual(readdirSync(root),[".codex"]);
  assert.deepEqual(readdirSync(join(root,".codex")),["hooks.json"]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("startup installation refuses legacy and redirected configuration without replacing it",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-install-refuse-")));
 try{
  mkdirSync(join(root,".codex"));
  const path=join(root,".codex/hooks.json"),scope={workspace:root,registry:join(root,"registry.sqlite")},args=["install-hooks","--receipts",join(root,"startup.sqlite")];
  const bytes=JSON.stringify({hooks:{SessionStart:[{hooks:[{command:"python governance-startup.py"}]}]}});
  writeFileSync(path,bytes);
  await assert.rejects(startupCommand(args,scope),/Legacy/);assert.equal(readFileSync(path,"utf8"),bytes);
  rmSync(path);symlinkSync(join(root,"absent"),path);
  await assert.rejects(startupCommand(args,scope),/ordinary/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
