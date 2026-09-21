import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { legacyJobInventory } from "../src/legacy-job-inventory.ts";

test("legacy inventory matches exact workspaces, preserves records and never infers drain", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),"legacy-inventory-")));
  try {
    const workspace = join(root,"project"), store = join(root,"store");
    mkdirSync(workspace); mkdirSync(join(store,"jobs"),{recursive:true});
    for (let i=1;i<=3;i++) {
      const id = `00000000-0000-0000-0000-00000000000${i}`, directory = join(store,"jobs",id);
      mkdirSync(directory);
      writeFileSync(join(directory,"status.json"),JSON.stringify({protocol_version:1,job_id:id,workspace:i===2?workspace+'-other':workspace,state:i===3?'running':'succeeded',response_tail:'private content'}));
    }
    const file = join(store,"jobs","00000000-0000-0000-0000-000000000001","status.json"), before = readFileSync(file);
    const result = legacyJobInventory(workspace,store);
    assert.equal(result.jobs.length,2); assert.equal(result.drain,"unverified");
    assert.equal(result.ownership,"legacy-owner-retained");
    assert.deepEqual(result.jobs.map(job=>job.state),['succeeded','running']);
    assert.equal(result.jobs[0]?.result,null);
    assert.equal(JSON.stringify(result).includes('private content'),false);
    assert.deepEqual(readFileSync(file),before);
    assert.equal(legacyJobInventory(workspace,store,1).truncated,true);
    const resultFile = join(store,"jobs","00000000-0000-0000-0000-000000000001","result.json");
    writeFileSync(resultFile,JSON.stringify({job_id:'00000000-0000-0000-0000-000000000001',protocol_version:1,state:'succeeded',cleanup_confirmed:true,answer:'private answer'}));
    const withReceipt = legacyJobInventory(workspace,store);
    assert.equal(withReceipt.jobs[0]?.result?.cleanupReported,'confirmed');
    assert.equal(withReceipt.drain,'unverified');
    assert.equal(JSON.stringify(withReceipt).includes('private answer'),false);
    writeFileSync(resultFile,JSON.stringify({job_id:'different',protocol_version:1,state:'succeeded',cleanup_confirmed:true}));
    assert.equal(legacyJobInventory(workspace,store).issues.length,1);
    rmSync(resultFile);
    writeFileSync(file,JSON.stringify({protocol_version:99,job_id:'unknown'}));
    const unsupported = legacyJobInventory(workspace,store);
    assert.equal(unsupported.issues.length,1); assert.equal(unsupported.drain,'unverified');
    rmSync(file);symlinkSync(join(root,'missing'),file);
    assert.equal(legacyJobInventory(workspace,store).issues.length,1);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
