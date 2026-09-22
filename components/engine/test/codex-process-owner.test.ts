import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { waitCommand } from "../src/process-owner.ts";
import { submitProviderJob } from "../src/provider-job.ts";
import { reconcileCommand } from "../src/command-recovery.ts";

test("shared owner exchanges Codex messages and cleans persistent completion or parent-input requests", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-owner-")));
  try {
    const extra = join(root, "additional"); mkdirSync(extra);
    const scopeLine = `Additional roots: ${JSON.stringify([extra])}`;
    for (const callback of [false, true]) {
      const script = `const rl=require('node:readline').createInterface({input:process.stdin});const send=v=>console.log(JSON.stringify(v));setInterval(()=>{},1000);
rl.on('line',line=>{const v=JSON.parse(line);
if(v.id===0)send({id:0,result:{}});
if(v.id===1)send({id:1,result:{model:'fixture',reasoningEffort:'high',cwd:process.cwd(),approvalPolicy:'never',sandbox:{type:'dangerFullAccess'},thread:{id:'session'}}});
if(v.id===2){if(!v.params.input[0].text.includes(${JSON.stringify(scopeLine)}) || !v.params.input[0].text.endsWith('Assignment:\\nassignment'))process.exit(9);send({id:2,result:{turn:{id:'turn'}}});
if(${callback})send({id:33,method:'item/tool/requestUserInput'});
else {send({method:'item/completed',params:{item:{type:'agentMessage',id:'answer',phase:'final_answer',text:JSON.stringify({outcome:'completed',answer:'done',artifacts:[],sources:[],checks:[],remaining:[]})}}});send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});}}
if(v.id===33)require('node:fs').writeFileSync('callback.json',JSON.stringify(v));
});`;
      const executable = join(root, callback ? "callback-native" : "complete-native");
      writeFileSync(executable, `#!${process.execPath}\n${script}`); chmodSync(executable, 0o700);
      const submitted = await submitProviderJob(join(root, callback ? "callback" : "completed"), { id: callback ? "callback" : "completed", prompt: "assignment",
        provider: "codex", model: "fixture", effort: "high", requiredTools: [], additionalRoots: [extra],
        executable, workspace: root, registry: join(root, "registry.sqlite"), assignment: { role: "reviewer", constraints: "No publication", context: "" }, deadlineMs: 8000, outputLimit: 16384 });
      const result = await waitCommand(submitted.directory, submitted.requestDigest, 10000);
      assert.equal(result.receipt?.state, callback ? "failed" : "succeeded");
      assert.equal(result.receipt?.reason, callback ? "provider-blocked" : "provider-completed");
      assert.equal(result.receipt?.cleanup, "confirmed");
      const evidence = JSON.parse(readFileSync(result.receipt!.providerResult!, "utf8"));
      assert.equal(evidence.state, callback ? "blocked" : "succeeded");
      assert.equal(evidence.identity.conversationId, "session");
      assert.equal(evidence.identity.turnId, "turn");
      reconcileCommand(submitted.directory, submitted.requestDigest);
      if (callback) assert.deepEqual(JSON.parse(readFileSync(join(root, "callback.json"), "utf8")), { id: 33, result: { answers: {} } });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
