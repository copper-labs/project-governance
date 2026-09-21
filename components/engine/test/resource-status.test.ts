import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync,readFileSync,existsSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {resourceStatus,resourceStatusCommand} from "../src/resource-status.ts";

test("resource version probe preserves missing, legacy and unknown future stores",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"resource-status-"))),path=join(root,"registry.sqlite");
 try {
  assert.equal(resourceStatus(path).state,"missing");assert.equal(existsSync(path),false);
  for(const [protocol,state] of [[1,"migration-required"],[2,"protocol-compatible"],[99,"incompatible"]] as const){
   const db=new DatabaseSync(path);db.exec(`PRAGMA user_version=${protocol}`);db.exec("CREATE TABLE IF NOT EXISTS future_state(value TEXT)");db.close();
   const before=readFileSync(path);
   assert.equal(resourceStatusCommand(["--registry",path]).state,state);
   assert.equal(resourceStatus(path).protocol,protocol);
   assert.deepEqual(readFileSync(path),before);
  }
  symlinkSync(path,join(root,"alias"));assert.throws(()=>resourceStatus(join(root,"alias")),/canonical/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
