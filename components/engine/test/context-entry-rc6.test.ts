import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { routeContext } from "../src/context-routing.ts";
import { localContextPath } from "../src/context-path-policy.ts";

test("first-commit subjects preserve staged bytes, untracked text, stale checks and invalid-base refusal", () => {
  const root = mkdtempSync(join(tmpdir(), "unborn-context-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q");
    assert.deepEqual(new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" })).paths(), []);
    writeFileSync(join(root, "first.ts"), "staged\n"); git("add", "first.ts");
    writeFileSync(join(root, "first.ts"), "working\n"); writeFileSync(join(root, "notes.md"), "new\n");
    symlinkSync("/does-not-exist", join(root, "pointer"));
    const staged = new ValidationSubject(root, resolveChangeScope(root, { staged: true }));
    const live = new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" }));
    assert.equal(staged.read("first.ts").toString(), "staged\n");
    assert.deepEqual(staged.paths(), ["first.ts"]);
    assert.equal(live.read("first.ts").toString(), "working\n");
    assert.deepEqual(live.paths(["notes.md"]), ["notes.md"]);
    assert.equal(live.source("pointer")?.file_type, "symlink");
    assert.match(staged.hunks("first.ts"), /\+staged/);
    writeFileSync(join(root, "notes.md"), "later\n");
    assert.throws(() => live.read("notes.md"), /changed after capture/);
    assert.throws(() => resolveChangeScope(root, { baseRef: "missing" }), /Git comparison failed/);
    assert.throws(() => new ValidationSubject(root, { ...resolveChangeScope(root, { staged: true }), unborn: undefined } as any), /identity/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a fresh profile routes local source with no commit or JEV approval and errors leave redacted receipts", async () => {
  const root = mkdtempSync(join(tmpdir(), "fresh-context-")), before = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    mkdirSync(join(root, "config/governance"), { recursive: true });
    for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
    writeFileSync(join(root, "index.ts"), "export const answer = 42;\n");
    writeFileSync(join(root, ".env"), "SECRET=never-deliver\n");
    const route = await contextRouteCommand(["--task", "implement answer", "--revision", "1"], root,
      resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(route.ready, true);
    assert.equal(route.route.selected?.id, "project");
    assert.ok(route.optional?.entries.some(entry => entry.id === "index.ts"));
    assert.ok(!route.optional?.entries.some(entry => entry.id === ".env"));
    await assert.rejects(contextRouteCommand(["--unsupported-secret-value", "SECRET=never-retain"], root), error => {
      assert.ok(error instanceof ContextRouteError);
      assert.equal(error.code, "invalid-arguments");
      const receipt = readFileSync(error.receiptPath!, "utf8");
      assert.ok(!receipt.includes("SECRET")); return true;
    });
    writeFileSync(join(root, "config/governance/profile.yaml"), "schema_version: 1\n");
    await assert.rejects(contextRouteCommand(["--task", "answer", "--revision", "1"], root), error => {
      assert.ok(error instanceof ContextRouteError); assert.equal(error.code, "router-missing");
      assert.ok(error.receiptPath); return true;
    });
  } finally {
    if (before === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = before;
    rmSync(root, { recursive: true, force: true });
  }
});

test("root routing uses the same recursive matcher and automatic paths exclude private payloads", () => {
  assert.equal(routeContext({ routes: [{ id: "typescript", match: { path_globs: ["**/*.ts"] } }] }, "edit", ["index.ts"]).outcome, "matched");
  for (const path of [".env", ".env.local", "credentials.json", "secrets/prod.yaml", "node_modules/pkg/index.ts", "build/generated.ts", "video.mp4", "key.pem", "a/../b.ts"]) assert.equal(localContextPath(path), false, path);
  assert.equal(localContextPath("src/answer.ts"), true);
});

test("unborn inventories without ignore rules refuse excessive capture before loading bodies", () => {
  const root = mkdtempSync(join(tmpdir(), "unborn-bounded-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    mkdirSync(join(root, "node_modules"));
    for (let i = 0; i < 4097; i++) writeFileSync(join(root, "node_modules", `${i}.js`), "");
    assert.throws(() => resolveChangeScope(root, { baseRef: "HEAD" }), /First-commit inventory exceeds capture bound/);
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const subject = new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" }));
    assert.deepEqual(subject.paths(), [".gitignore"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
