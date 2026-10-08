import { removeRuntimeFixture } from "./fixtures/remove-runtime-fixture.ts";
import { protectRuntimePayload } from "../src/runtime-payload-protection.ts";
import { runtimeTree } from "../src/runtime-tree.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, chmodSync, statSync, rmSync, lstatSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { stageRuntimeArchive } from "../src/runtime-staging.ts";
import { inspectRuntimeGeneration } from "../src/runtime-inspection.ts";
import type { CompiledRuntimeLock } from "../src/runtime-lock.ts";

function fixture(root: string) {
  const source = join(root, "package"), archive = join(root, "runtime.tgz");
  mkdirSync(join(source, "dist/engine/src"), { recursive: true });
  mkdirSync(join(source, "dist/engine/assets"), { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "@organta/project-governance", version: "3.0.0", type: "module",
    engines: { node: ">=24.16.0 <25" }, bin: { "project-governance": "dist/engine/src/cli.js" } }));
  writeFileSync(join(source, "dist/engine/src/cli.js"), '#!/usr/bin/env node\nconsole.log("project-governance 3.0.0");\n');
  writeFileSync(join(source, "dist/engine/assets/runtime-dependencies.lock.json"), JSON.stringify({ lockfileVersion: 3,
    name: "@organta/project-governance", version: "3.0.0", packages: { "": {} } }));
  execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
  const lock: CompiledRuntimeLock = { schema_version: 2, package: "@organta/project-governance", version: "3.0.0",
    artifact: { url: "file:///runtime.tgz", integrity: "sha512-" + createHash("sha512").update(readFileSync(archive)).digest("base64") },
    source_commit: "a".repeat(40), node: ">=24.16.0 <25", configuration_schema: 1 };
  return stageRuntimeArchive(archive, lock, join(root, "stages"));
}

test("staged payload rejects incidental root and nested writes while its CLI stays readable and executable", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "payload-protection-")));
  try {
    const staged = fixture(root), pkg = join(staged.directory, "node_modules/@organta/project-governance");
    for (const directory of [pkg, join(pkg, "dist/engine/src")]) {
      assert.throws(() => writeFileSync(join(directory, ".DS_Store"), "synthetic metadata"), (error: any) => error.code === "EACCES" || error.code === "EPERM");
      assert.equal(statSync(directory).mode & 0o222, 0);
    }
    assert.throws(() => writeFileSync(staged.executable, "modified code"), (error: any) => error.code === "EACCES" || error.code === "EPERM");
    assert.ok(statSync(staged.executable).mode & 0o111);
    assert.equal(inspectRuntimeGeneration(staged.directory).state, "verified");
    assert.equal(execFileSync(process.execPath, [staged.executable, "--version"], { encoding: "utf8" }).trim(), "project-governance 3.0.0");
    // Mutable operation state stays outside the protected package.
    writeFileSync(join(staged.directory, "operator-fixture.json"), "{}");
  } finally { removeRuntimeFixture(root); }
});

test("explicitly restored write access cannot bypass the unchanged full installed-tree integrity check", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "payload-integrity-")));
  try {
    const staged = fixture(root), pkg = join(staged.directory, "node_modules/@organta/project-governance");
    chmodSync(pkg, statSync(pkg).mode | 0o200);
    const added = join(pkg, ".DS_Store"); writeFileSync(added, "synthetic metadata");
    assert.throws(() => inspectRuntimeGeneration(staged.directory), /payload differs/);
    rmSync(added); assert.equal(inspectRuntimeGeneration(staged.directory).state, "verified");
    chmodSync(staged.executable, statSync(staged.executable).mode | 0o200);
    writeFileSync(staged.executable, "modified code");
    assert.throws(() => inspectRuntimeGeneration(staged.directory), /payload differs/);
    assert.equal(JSON.parse(readFileSync(join(staged.directory, "installation.json"), "utf8")).state, "staged");
  } finally { removeRuntimeFixture(root); }
});


test("protection preserves internal symlinks and exact content/executable identity on replay", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "payload-link-")));
  try {
    mkdirSync(join(root, "nested")); writeFileSync(join(root, "nested/code.js"), "synthetic code", { mode: 0o751 });
    symlinkSync("nested/code.js", join(root, "internal"));
    const before = runtimeTree(root);
    assert.deepEqual(protectRuntimePayload(root), before);
    assert.deepEqual(protectRuntimePayload(root), before);
    assert.equal(lstatSync(join(root, "internal")).isSymbolicLink(), true);
    assert.equal(statSync(join(root, "nested/code.js")).mode & 0o111, 0o111);
    assert.equal(statSync(join(root, "nested/code.js")).mode & 0o222, 0);
  } finally { removeRuntimeFixture(root); }
});

test("an escaping symlink refuses protection before changing package or outside permissions", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "payload-link-refusal-")));
  try {
    const pkg = join(root, "package"), outside = join(root, "outside.js");
    mkdirSync(pkg); writeFileSync(outside, "outside sentinel", { mode: 0o600 });
    writeFileSync(join(pkg, "owned.js"), "owned sentinel", { mode: 0o600 });
    symlinkSync("../outside.js", join(pkg, "escape"));
    const before = [statSync(pkg).mode, statSync(join(pkg, "owned.js")).mode, statSync(outside).mode];
    assert.throws(() => protectRuntimePayload(pkg), /link escapes/);
    assert.deepEqual([statSync(pkg).mode, statSync(join(pkg, "owned.js")).mode, statSync(outside).mode], before);
    assert.equal(readFileSync(outside, "utf8"), "outside sentinel");
  } finally { removeRuntimeFixture(root); }
});


test("hard-linked files refuse protection before any package or shared inode permission changes", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "payload-hardlink-refusal-")));
  try {
    const pkg = join(root, "package"), outside = join(root, "outside.js");
    mkdirSync(pkg); writeFileSync(outside, "shared sentinel", { mode: 0o600 });
    writeFileSync(join(pkg, "a-owned.js"), "owned sentinel", { mode: 0o600 });
    linkSync(outside, join(pkg, "shared.js"));
    const before = [statSync(pkg).mode, statSync(join(pkg, "a-owned.js")).mode, statSync(outside).mode];
    assert.throws(() => protectRuntimePayload(pkg), /exclusively owned/);
    assert.deepEqual([statSync(pkg).mode, statSync(join(pkg, "a-owned.js")).mode, statSync(outside).mode], before);
    assert.equal(readFileSync(outside, "utf8"), "shared sentinel");
  } finally { removeRuntimeFixture(root); }
});
