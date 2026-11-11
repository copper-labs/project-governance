import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const packageRoot = process.env.GOVERNANCE_TEST_PACKAGE;
const runtimeModule = (name: string) => packageRoot
  ? pathToFileURL(join(realpathSync(packageRoot), "dist/engine/src", name + ".js")).href
  : new URL("../src/" + name + ".ts", import.meta.url).href;
const { resolveChangeScope } = await import(runtimeModule("change-subject")) as typeof import("../src/change-subject.ts");
const { checkSecrets } = await import(runtimeModule("checkers/secret-scan")) as typeof import("../src/checkers/secret-scan.ts");
const schemaPath = packageRoot
  ? pathToFileURL(join(realpathSync(packageRoot), "dist/engine/assets/defaults/schemas/secret-waivers.schema.json"))
  : new URL("../../../src/project_governance_runtime/defaults/schemas/secret-waivers.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const config = { waiverRegistry: { version: 1, owner: "fixture", waivers: [] }, waiverSchema: schema, today: "2026-09-20" };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "engine-secret-scan-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  writeFileSync(join(root, "config.txt"), "ordinary content\n"); git("add", "."); git("commit", "-qm", "base");
  return { root, git, close: () => rmSync(root, { recursive: true }) };
}

test("full scan detects a staged credential after worktree repair, even behind a replacement ref", async () => {
  const f = fixture();
  try {
    const original = f.git("rev-parse", "HEAD:config.txt");
    writeFileSync(join(f.root, "config.txt"), "ghp_" + "A".repeat(36)); f.git("add", "config.txt");
    const secretBlob = f.git("rev-parse", ":config.txt");
    writeFileSync(join(f.root, "config.txt"), "repaired working copy\n");
    f.git("replace", secretBlob, original);
    const result = await checkSecrets(f.root, { ...config, scope: resolveChangeScope(f.root, { all: true }) });
    assert.equal(result.status, "failed");
    assert.equal(result.findings.filter(f => f.rule_id === "security.embedded-secret").length, 1);
    assert.equal(result.findings[0]!["detector_id"], "github-token");
    assert.ok(!JSON.stringify(result).includes("A".repeat(36)));
  } finally { f.close(); }
});

test("narrow scan reads captured index bytes and refuses changed live after-images", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "config.txt"), "ghp_" + "B".repeat(36)); f.git("add", "config.txt");
    const staged = resolveChangeScope(f.root, { staged: true });
    writeFileSync(join(f.root, "config.txt"), "clean again\n");
    assert.equal((await checkSecrets(f.root, { ...config, scope: staged })).status, "failed");
    const live = resolveChangeScope(f.root, { baseRef: "HEAD" });
    writeFileSync(join(f.root, "config.txt"), "changed after scope capture\n");
    const stale = await checkSecrets(f.root, { ...config, scope: live });
    assert.ok(stale.findings.some(f => f.rule_id === "security.scan-unavailable"));
  } finally { f.close(); }
});

test("full scan streams large binary files and never follows a final symlink", async () => {
  const f = fixture();
  try {
    const large = Buffer.alloc(17 * 1024 * 1024, 0);
    Buffer.from("ghp_" + "C".repeat(36)).copy(large, large.length - 40);
    writeFileSync(join(f.root, "large.bin"), large);
    symlinkSync("/unavailable/outside", join(f.root, "link"));
    const result = await checkSecrets(f.root, { ...config, scope: resolveChangeScope(f.root, { all: true }) });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(f => [f.rule_id, f["path"]]), [["security.embedded-secret", "large.bin"]]);
  } finally { f.close(); }
});


test("exhaustive scans batch unique index blobs and reuse them for the complete candidate", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 260; i++) writeFileSync(join(f.root, "fixture-" + i + ".txt"), "distinct fixture " + i + "\n");
    f.git("add", "."); f.git("commit", "-qm", "batch fixture");
    const script = [
      'import cp from "node:child_process"; import {syncBuiltinESMExports} from "node:module";',
      'const original=cp.spawn; let count=0; cp.spawn=function(...args){if(args[0]==="git"&&args[1]?.[0]==="cat-file")count++;return original.apply(this,args)};syncBuiltinESMExports();',
      'const {checkSecrets}=await import(' + JSON.stringify(runtimeModule("checkers/secret-scan")) + ');',
      'const {resolveChangeScope}=await import(' + JSON.stringify(runtimeModule("change-subject")) + ');',
      'const root=' + JSON.stringify(f.root) + ', config=' + JSON.stringify(config) + ';',
      'const result=await checkSecrets(root,{...config,scope:resolveChangeScope(root,{all:true}),candidateScope:resolveChangeScope(root,{candidateRef:' + JSON.stringify(f.git("rev-parse", "HEAD")) + ',baseRef:"HEAD~1"})});',
      'console.log(JSON.stringify({count,status:result.status,findings:result.findings}));',
    ].join("\n");
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script],
      { cwd: f.root, encoding: "utf8", timeout: 30_000 }));
    assert.equal(result.status, "passed"); assert.deepEqual(result.findings, []);
    assert.equal(result.count, 3, "261 unique blobs require three bounded Git batches, not one process per blob");
  } finally { f.close(); }
});
