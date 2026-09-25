import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, renameSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationSubject, resolveChangeScope, readSubjectSource, safeSubjectPath, subjectDigest, worktreeBytes } from "../src/change-subject.ts";

function repository() {
  const root = mkdtempSync(join(tmpdir(), "engine-subject-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  writeFileSync(join(root, "code.ts"), "const value = 1;\n");
  writeFileSync(join(root, "rename.txt"), "retained content\n");
  writeFileSync(join(root, "delete.txt"), "obsolete\n");
  git("add", "."); git("commit", "-qm", "fixture base");
  return { root, git, close: () => rmSync(root, { recursive: true }) };
}

test("staged subjects retain captured blob bytes after both worktree and index change", () => {
  const f = repository();
  try {
    writeFileSync(join(f.root, "code.ts"), "const value = 2;\n"); f.git("add", "code.ts");
    writeFileSync(join(f.root, "code.ts"), "const value = 3;\n");
    const scope = resolveChangeScope(f.root, { staged: true }), record = scope.records[0]!;
    assert.equal(readSubjectSource(f.root, record.after!).toString(), "const value = 2;\n");
    assert.equal(readSubjectSource(f.root, record.before!).toString(), "const value = 1;\n");
    assert.deepEqual(record.changed_ranges, [{ start: 1, end: 1 }]);
    f.git("add", "code.ts");
    assert.equal(readSubjectSource(f.root, record.after!).toString(), "const value = 2;\n");
    assert.notEqual(resolveChangeScope(f.root, { staged: true }).subject_digest, scope.subject_digest);
  } finally { f.close(); }
});

test("renames, deletes, additions and symlink payloads preserve distinct subject identities", () => {
  const f = repository();
  try {
    renameSync(join(f.root, "rename.txt"), join(f.root, "renamed.txt"));
    rmSync(join(f.root, "delete.txt"));
    symlinkSync("/outside/never-read", join(f.root, "pointer"));
    writeFileSync(join(f.root, "café.txt"), "unicode path\n");
    f.git("add", ".");
    const scope = resolveChangeScope(f.root, { staged: true });
    const renamed = scope.records.find(r => r.path === "renamed.txt")!;
    assert.equal(renamed.status, "renamed"); assert.equal(renamed.previous_path, "rename.txt");
    assert.equal(scope.records.find(r => r.path === "delete.txt")!.after, null);
    const link = scope.records.find(r => r.path === "pointer")!.after!;
    assert.equal(link.file_type, "symlink"); assert.equal(readSubjectSource(f.root, link).toString(), "/outside/never-read");
    assert.equal(scope.subject_digest, subjectDigest([...scope.records].reverse()));
  } finally { f.close(); }
});

test("worktree subjects detect edits and explicit selection requires its declared base", () => {
  const f = repository();
  try {
    assert.throws(() => resolveChangeScope(f.root, { paths: ["code.ts"] }), /comparison base/);
    const scope = resolveChangeScope(f.root, { baseRef: "HEAD", paths: ["code.ts"] });
    assert.equal(scope.records[0]!.status, "modified");
    writeFileSync(join(f.root, "code.ts"), "changed after capture\n");
    assert.throws(() => readSubjectSource(f.root, scope.records[0]!.after!), /changed after capture/);
    assert.throws(() => resolveChangeScope(f.root, { baseRef: "missing-ref" }), /unavailable/);
    assert.equal(resolveChangeScope(f.root, { all: true }).subject_digest, null);
  } finally { f.close(); }
});

test("unsafe paths and intermediate symlinks cannot make outside files part of a subject", () => {
  const f = repository();
  try {
    for (const path of ["../secret", "/secret", "a/../b", "a//b", "./a", "."]) assert.throws(() => safeSubjectPath(path), /unsafe/);
    mkdirSync(join(f.root, "real")); writeFileSync(join(f.root, "real/input"), "safe\n");
    symlinkSync("real", join(f.root, "alias"));
    assert.throws(() => worktreeBytes(f.root, "alias/input"), /traverse a symlink/);
  } finally { f.close(); }
});


test("validation graph reads immutable base plus selected overlay instead of unrelated dirty files", () => {
  const f = repository();
  try {
    writeFileSync(join(f.root, "code.ts"), "selected change\n");
    writeFileSync(join(f.root, "rename.txt"), "unrelated dirty content\n");
    const scope = resolveChangeScope(f.root, { baseRef: "HEAD", paths: ["code.ts"] });
    const subject = new ValidationSubject(f.root, scope);
    assert.equal(subject.read("code.ts").toString(), "selected change\n");
    const exposed = subject.source("code.ts")!;
    exposed.identity = "mutated";
    assert.equal(subject.read("code.ts").toString(), "selected change\n");
    assert.equal(subject.read("rename.txt").toString(), "retained content\n");
    assert.deepEqual(subject.paths(), ["code.ts", "delete.txt", "rename.txt"]);
    assert.throws(() => subject.read("code.ts", 1), /budget|bounded/);
    assert.throws(() => new ValidationSubject(f.root, { ...scope, subject_digest: "invented" }), /identity/);
  } finally { f.close(); }
});

test("whole-tree metadata failure preserves narrow reads and directory rejection", () => {
  const f = repository(), oldPath = process.env.PATH;
  try {
    mkdirSync(join(f.root, "nested")); writeFileSync(join(f.root, "nested/item.ts"), "export const value=1;\n");
    f.git("add", "."); f.git("commit", "-qm", "nested fixture");
    const subject = new ValidationSubject(f.root, resolveChangeScope(f.root, { baseRef: "HEAD" }));
    const actualGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const bin = join(f.root, "fake-bin"); mkdirSync(bin);
    writeFileSync(join(bin, "git"), `#!${process.execPath}\nconst {execFileSync}=require('node:child_process');\nconst args=process.argv.slice(2);\nif(args[0]==='ls-tree'&&args[1]==='-r'&&args[2]==='-z')process.exit(1);\nexecFileSync(${JSON.stringify(actualGit)},args,{stdio:'inherit'});\n`, { mode: 0o755 });
    process.env.PATH = `${bin}:${oldPath}`;
    assert.equal(subject.read("code.ts").toString(), "const value = 1;\n");
    assert.deepEqual(subject.paths(["nested"]), ["nested/item.ts"]);
    assert.throws(() => subject.source("nested"), /not a blob/);
  } finally { process.env.PATH = oldPath; f.close(); }
});

test("bulk source descriptions use captured staged bytes and retain per-file exclusions", () => {
  const f = repository();
  try {
    writeFileSync(join(f.root, "code.ts"), "export function stagedSymbol() {}\n"); f.git("add", "code.ts");
    const subject = new ValidationSubject(f.root, resolveChangeScope(f.root, { staged: true }));
    writeFileSync(join(f.root, "code.ts"), "export function unrelatedDirtySymbol() {}\n"); f.git("add", "code.ts");
    const batch = subject.readBatch(["code.ts", "rename.txt", "missing.ts"]);
    assert.equal(batch.get("code.ts")?.toString(), "export function stagedSymbol() {}\n");
    assert.equal(batch.get("rename.txt")?.toString(), "retained content\n");
    assert.equal(batch.get("missing.ts"), "source-not-regular");
    assert.equal(subject.readBatch(["code.ts"], 1).get("code.ts"), "source-unavailable-or-over-limit");
  } finally { f.close(); }
});
