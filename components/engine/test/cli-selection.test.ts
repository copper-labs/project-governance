import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareCommand, planCommand } from "../src/cli.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { runChecks } from "../src/check-run.ts";
import { processLiveFingerprint } from "../src/process-owner.ts";

const assets = fileURLToPath(new URL("../../../src/project_governance_runtime/", import.meta.url));
const oldPath = "old/feature.txt", newPath = "new/feature.txt", content = "Captured rename content\n";
const removalCheck = `
  const fs=require('node:fs'),packet=JSON.parse(fs.readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET));
  const removed=packet.records.some(record=>(record.previous_path??'').startsWith('old/'));
  console.log(JSON.stringify({status:removed?'failed':'passed',findings:removed?[{rule_id:'fixture.old-owner-removal',
    severity:'blocking',path:'old/feature.txt',message:'The old owner must assess this removal.'}]:[]}));
`;

function fixture(mode: "split" | "shared" | "unmapped") {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "cli-rename-selection-"))), root = join(directory, "repo"), runs = join(directory, "runs");
  mkdirSync(join(root, "old"), { recursive: true }); mkdirSync(join(root, "new")); mkdirSync(join(root, "config/validation/packs"), { recursive: true });
  writeFileSync(join(root, oldPath), content);
  const addPack = (id: string, path_globs: string[], commands: unknown[]) => writeFileSync(join(root, `config/validation/packs/${id}.yaml`),
    JSON.stringify({ id, enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs, commands }));
  if (mode === "shared") addPack("shared-owner", ["old/**", "new/**"], [{ builtin: "format" }]);
  else {
    addPack("old-owner", [mode === "unmapped" ? "unrelated/**" : "old/**"], [{ run: [process.execPath, "-e", removalCheck] }]);
    addPack("new-owner", ["new/**"], [{ builtin: "format" }]);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic rename baseline");
  git("mv", "--", oldPath, newPath);
  return { directory, root, runs };
}

async function closeFixture(directory: string, runs: string, verified: boolean) {
  const owners = existsSync(runs) ? readdirSync(runs, { recursive: true, encoding: "utf8" })
    .filter(path => /(?:^|\/)(owner|guardian)\.json$/.test(path))
    .map(path => JSON.parse(readFileSync(join(runs, path), "utf8")) as { pid: number; fingerprint: string }) : [];
  const deadline = Date.now() + 5000;
  while (owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(owners.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint), `Recorded fixture writers remain live: ${directory}`);
  if (verified) rmSync(directory, { recursive: true, force: true });
  else console.error(`Preserved rename-selection evidence: ${directory}`);
}

for (const mode of ["split", "shared", "unmapped"] as const) test(`ordinary plan/check retains both rename impacts with ${mode} ownership`, async () => {
  const f = fixture(mode); let verified = false;
  try {
    const args = ["--stage", "batch", "--mode", "impacted", "--base-ref", "HEAD"];
    const planned = planCommand(args, f.root, join(assets, "packs")), prepared = prepareCommand(args, f.root, join(assets, "packs"), "check");
    assert.equal(planned.change_scope.records.length, 1, "Selection must not duplicate the immutable rename record");
    assert.equal(planned.change_scope.records[0]?.status, "renamed");
    assert.equal(planned.change_scope.records[0]?.previous_path, oldPath);
    assert.deepEqual(planned.changed_paths, [newPath, oldPath]);
    assert.deepEqual(prepared.plan, Object.fromEntries(Object.entries(planned).filter(([key]) => key !== "change_scope")));
    assert.equal(prepared.subject.source(oldPath), null);
    assert.equal(prepared.subject.read(newPath).toString(), content);
    if (mode === "split") {
      assert.equal(planned.status, "ready");
      assert.deepEqual(planned.execution_order, ["new-owner", "old-owner"]);
      assert.deepEqual(Object.entries(planned.path_matches), [[newPath, ["new-owner"]], [oldPath, ["old-owner"]]]);
      const staged = planCommand(["--stage", "pre-commit", "--mode", "impacted", "--staged"], f.root, join(assets, "packs"));
      assert.ok(staged.selected_packs.includes("old-owner") && staged.selected_packs.includes("new-owner"));
      assert.deepEqual(staged.changed_paths, [newPath, oldPath]);
    } else if (mode === "shared") {
      assert.equal(planned.status, "ready");
      assert.deepEqual(planned.execution_order, ["shared-owner"], "A shared owner runs once for both paths");
      assert.deepEqual(Object.entries(planned.path_matches), [[newPath, ["shared-owner"]], [oldPath, ["shared-owner"]]]);
    } else {
      assert.equal(planned.status, "blocked");
      assert.equal(planned.blockers[0]?.code, "unknown-impact");
      assert.deepEqual(planned.blockers[0]?.paths, [oldPath]);
      assert.deepEqual(planned.execution_order, []);
    }
    const result = await runChecks(prepared.registry, prepared.plan, { scope: prepared.scope, subject: prepared.subject,
      assets: new PackagedCheckerAssets(join(assets, "defaults")), packIds: new Set(Object.keys(prepared.registry)), stage: "batch", asOf: "2026-10-04T12:00:00Z" },
      { root: f.runs, deadlineMs: 15000, trigger: "test" });
    assert.equal(result.status, mode === "shared" ? "passed" : "failed");
    if (mode === "split") {
      const old = result.results.find(pack => pack.pack_id === "old-owner")!;
      assert.equal(old.commands[0]?.findings[0]?.rule_id, "fixture.old-owner-removal");
      assert.equal((old.commands[0]?.command_receipt as { cleanup: string }).cleanup, "confirmed");
      const packet = JSON.parse(readFileSync(join(result.run_directory, "packet/change-packet.json"), "utf8"));
      assert.equal(packet.records.length, 1);
      assert.equal(packet.records[0].previous_path, oldPath);
      assert.equal(packet.subject_digest, prepared.scope.subject_digest);
    } else if (mode === "shared") assert.equal(result.results.length, 1);
    else assert.deepEqual(result.results, []);
    verified = true;
  } finally { await closeFixture(f.directory, f.runs, verified); }
});
