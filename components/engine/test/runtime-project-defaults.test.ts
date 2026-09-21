import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,writeFileSync,rmSync,readdirSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PROJECT_DEFAULTS,installProjectDefaults} from "../src/runtime-project-defaults.ts";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {backupRuntimeState} from "../src/runtime-backup.ts";

test("initial defaults preserve authored configuration, refuse conflicts and reuse complete writes",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"project-defaults-"))),registry=join(root,"registry.sqlite"),backup=join(root,"backup");
 const generations=new RuntimeGenerations(registry);
 try {
  mkdirSync(join(root,"config/governance"),{recursive:true});mkdirSync(join(root,".governance"));
  mkdirSync(join(root,".githooks"));
  const profile=join(root,"config/governance/profile.yaml"),facts=join(root,"config/governance/facts.lock.yaml");
  writeFileSync(profile,"schema_version: 1\nproject_extensions: [custom]\n");
  const authored=readFileSync(profile),owner=generations.beginMaintenance("init-defaults",0);
  await backupRuntimeState(registry,owner.token,owner.owner,Object.keys(PROJECT_DEFAULTS).map(relative=>({path:join(root,relative),kind:relative.endsWith("profile.yaml")?"file" as const:"absent" as const})),backup);
  const install=()=>installProjectDefaults(root,registry,backup,owner.token,owner.owner);
  writeFileSync(facts,"authored after backup");
  assert.throws(install,/changed since backup/);assert.equal(readFileSync(facts,"utf8"),"authored after backup");
  rmSync(facts);symlinkSync(join(root,"missing"),facts);assert.throws(install,/changed since backup/);rmSync(facts);
  install();install();
  assert.deepEqual(readFileSync(profile),authored);
  assert.equal(readFileSync(facts,"utf8"),PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]);
  assert.equal(readdirSync(join(root,"config/governance")).some(name=>name.endsWith(".tmp")),false);
  assert.equal(generations.state().maintenance?.token,owner.token);
 }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});
