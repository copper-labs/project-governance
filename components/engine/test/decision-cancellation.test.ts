import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_DECISIONS } from "../src/decisions.ts";
import { withDecisionCancellation } from "../src/decision-cancellation.ts";

test("decision signal listeners are restored after normal completion and errors", async () => {
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  assert.deepEqual(await withDecisionCancellation(async () => "done"), { value: "done", exitCode: null });
  await assert.rejects(withDecisionCancellation(async () => { throw new Error("fixture"); }), /fixture/);
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], before);
});

test("CLI interruption aborts active optional advice and returns cancellation evidence with exit 143", () => {
  const root = mkdtempSync(join(tmpdir(), "decision-cli-cancel-"));
  try {
    writeFileSync(join(root, "cases.json"), JSON.stringify([{ id: "cancel", usefulOptionalIds: ["a"], request: {
      taskRevision: "1", purpose: "find state", maximumBytes: 1000, required: [], optional: [{id:"a",sourceDigest:"fixture",excerpt:"state"}],
    } }]));
    writeFileSync(join(root, "config.json"), JSON.stringify({ ...DEFAULT_DECISIONS, mode: "auto", allowedQuestions: ["rank_optional_context"], allowedDataClasses: ["source"], allowedSourcePaths: ["a"] }));
    writeFileSync(join(root, "transport.mjs"), `globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('fixture abort')),{once:true});setTimeout(()=>process.kill(process.pid,'SIGTERM'),20)});`);
    const result = spawnSync(process.execPath, ["--import", join(root,"transport.mjs"), fileURLToPath(new URL("../src/cli.ts", import.meta.url)), "context-evaluate", "--dataset", "cases.json", "--decision-config", "config.json"], {
      cwd: root, env: {...process.env, JEV_TOKEN:"synthetic-fixture", XDG_STATE_HOME:join(root,"state")}, encoding:"utf8",timeout:5000,
    });
    assert.equal(result.status, 143, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.results[0].fallbackReason, "cancelled");
    assert.equal(output.results[0].decision.method, "baseline");
    assert.equal(output.results[0].decision.suggested, null);
    assert.ok(output.receiptId);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
