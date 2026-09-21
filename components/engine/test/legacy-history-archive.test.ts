import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,statSync,symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { archiveLegacyHistory, inspectLegacyHistoryArchive } from "../src/legacy-history-archive.ts";
import { fileDigest } from "../src/core.ts";
import { requireLegacyHistory, verifyLegacyHistory } from "../src/legacy-history-completion.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";

test("legacy archive preserves receipts and nested evidence without taking execution authority",()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"legacy-archive-")));
  try {
    const workspace=join(root,"project"),store=join(root,"store"),id="00000000-0000-0000-0000-000000000001",job=join(store,"jobs",id);
    mkdirSync(workspace);mkdirSync(join(job,"case/empty"),{recursive:true});
    const record={job_id:id,protocol_version:1,workspace,state:"succeeded",cleanup_confirmed:true};
    writeFileSync(join(job,"status.json"),JSON.stringify(record));writeFileSync(join(job,"result.json"),JSON.stringify(record));
    writeFileSync(join(job,"case/proof.bin"),Buffer.from([0,255,32]),{mode:0o755});
    const output=join(root,"archive"),receipt=archiveLegacyHistory(workspace,store,output);
    assert.equal(receipt.state,"verified");assert.equal(receipt.drain,"unverified");
    assert.equal(receipt.externalReferences,"not-verified");
    assert.deepEqual(readFileSync(join(output,id,"case/proof.bin")),Buffer.from([0,255,32]));
    assert.equal(statSync(join(output,id,"case/proof.bin")).mode & 0o777,0o600);
    assert.equal(receipt.records[0]?.files.find(file=>file.path==="case/proof.bin")?.mode,0o755);
    assert.ok(existsSync(join(output,id,"case/empty")));
    assert.equal(readFileSync(join(job,"result.json"),"utf8"),JSON.stringify(record));
    assert.throws(()=>archiveLegacyHistory(workspace,store,output));
    assert.throws(()=>archiveLegacyHistory(workspace,store,join(store,"archive")),/outside legacy store/);
    symlinkSync(root,join(root,"alias-root"));
    assert.throws(()=>archiveLegacyHistory(workspace,store,join(root,"alias-root/new-archive")),/aliases/);
    assert.equal(existsSync(join(root,"new-archive")),false);
    writeFileSync(join(job,"result.json"),JSON.stringify({...record,cleanup_confirmed:false}));
    assert.throws(()=>archiveLegacyHistory(workspace,store,join(root,"unconfirmed")),/terminal receipts/);
    assert.equal(existsSync(join(root,"unconfirmed")),false);
    writeFileSync(join(job,"result.json"),JSON.stringify(record));
    symlinkSync(join(job,"result.json"),join(job,"case/alias"));
    assert.throws(()=>archiveLegacyHistory(workspace,store,join(root,"aliased")),/aliases/);
    assert.equal(existsSync(join(root,"aliased")),false);
    const receiptDigest = fileDigest(join(output,"archive.json"));
    const registry=join(root,"registry.sqlite"), generations=new RuntimeGenerations(registry);
    const maintenance=generations.beginMaintenance("migration",0);generations.close();
    const history={directory:output,receiptDigest};
    const historyDigest=requireLegacyHistory(registry,workspace,maintenance.token,maintenance.owner,history);
    assert.equal(verifyLegacyHistory(workspace,history),historyDigest);
    assert.throws(()=>verifyLegacyHistory(root,history),/another workspace/);
    const reopened=new RuntimeGenerations(registry);
    try {
      assert.throws(()=>reopened.endMaintenance(maintenance.token,maintenance.owner),/Legacy history readback/);
      assert.throws(()=>reopened.finishMaintenance(maintenance.token,maintenance.owner,0,{workspace,lockDigest:"fixture",readback:"fixture"}),/Legacy history readback/);
      assert.equal(reopened.state().maintenance?.token,maintenance.token);
    } finally {reopened.close();}
    rmSync(store,{recursive:true});
    assert.equal(inspectLegacyHistoryArchive(output,receiptDigest).jobs,1);
    assert.throws(()=>inspectLegacyHistoryArchive(output,"sha256:"+"0".repeat(64)),/digest differs/);
    writeFileSync(join(output,id,"case/proof.bin"),"corrupt");
    assert.throws(()=>inspectLegacyHistoryArchive(output,receiptDigest),/contents differ/);
    assert.throws(()=>verifyLegacyHistory(workspace,history),/contents differ/);
    writeFileSync(join(output,id,"case/proof.bin"),Buffer.from([0,255,32]));
    writeFileSync(join(output,"unexpected"),"untracked");
    assert.throws(()=>inspectLegacyHistoryArchive(output,receiptDigest),/Unexpected/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
