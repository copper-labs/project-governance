import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { maintainContextProjection } from "../src/context-projection.ts";
import { extractSourceFacts, resolveSourceLink } from "../src/context-source-facts.ts";
import { ProjectionStore, PROJECTION_FILE, PROJECTION_MAX_BYTES, projectionIdentity, projectionStatus } from "../src/context-projection-store.ts";

function fixture(t: { after: (fn: () => void) => void }) {
  const base = mkdtempSync(join(tmpdir(), "maintained-context-")), root = join(base, "repo"), state = join(base, "state"); mkdirSync(root);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "base");
  const write = (path: string, content: string) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), content); };
  const subject = (staged = false) => new ValidationSubject(root, resolveChangeScope(root, staged ? { staged: true } : { baseRef: "HEAD" }), { workingTree: !staged });
  const run = (options = {}) => { const selected = subject(); return maintainContextProjection(selected, selected.paths(), state, { deadlineAt: performance.now() + 5000, ...options }); };
  return { base, root, state, git, write, subject, run };
}

test("failed source extraction closes the projection connection", t => {
  const f = fixture(t); f.write("broken.ts", "export const broken = true;\n");
  const subject = f.subject();
  subject.readBatch = () => { throw new Error("fixture extraction failed"); };
  const originalClose = ProjectionStore.prototype.close;
  let closes = 0;
  ProjectionStore.prototype.close = function () { closes++; return originalClose.call(this); };
  try {
    assert.throws(() => maintainContextProjection(subject, ["broken.ts"], f.state), /fixture extraction failed/);
    assert.equal(closes, 1);
  } finally { ProjectionStore.prototype.close = originalClose; }
});

test("cold/warm source facts, one-file change, rename/delete, FTS and extractor replacement", t => {
  const f = fixture(t); f.write("src/a.ts", "/** Renew expired sessions before sending. */\nexport function renewSession() { return 1; }\n");
  f.write("src/b.ts", "export const unaffected = 1;\n"); f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "sources");
  const cold = f.run({ purpose: "expired sessions" }); assert.equal(cold.status.extractedCount, 2); assert.equal(cold.status.fts, true); assert.ok(cold.priority.includes("src/a.ts"));
  const warm = f.run(); assert.equal(warm.status.reusedCount, 2); assert.equal(warm.capturedBytes, 0); assert.equal(warm.status.extractedCount, 0);
  f.write("src/a.ts", "export function renewSession() { return 2; }\n");
  assert.equal(f.run().status.extractedCount, 1);
  renameSync(join(f.root, "src/b.ts"), join(f.root, "src/c.ts"));
  const renamed = f.run(); assert.equal(renamed.status.reusedCount, 2); assert.equal(renamed.entries.has("src/b.ts"), false);
  assert.match(renamed.entries.get("src/c.ts")!.text, /src\/c.ts/); assert.ok(!renamed.entries.get("src/c.ts")!.text.includes("src/b.ts"));
  assert.equal(f.run({ extractor: "test-new-extractor" }).status.extractedCount, 2);
  const db = new DatabaseSync(join(f.state, PROJECTION_FILE), { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM generation").get()!["n"], 1); db.close();
});

test("staged and working source maps cannot borrow each other's contents; filtered bytes stay literal", t => {
  const f = fixture(t); f.write("a.ts", "export const value = 'staged';\n"); f.git("add", "a.ts"); f.write("a.ts", "export const value = 'working';\n");
  const working = f.run(), staged = f.subject(true), index = maintainContextProjection(staged, staged.paths(), f.state);
  assert.notEqual(working.facts.get("a.ts")?.digest, index.facts.get("a.ts")?.digest);
  assert.match(staged.read("a.ts").toString(), /staged/); assert.match(f.subject().read("a.ts").toString(), /working/);
  f.write(".gitattributes", "a.ts text eol=lf\n"); f.write("a.ts", "export const value = 'filtered';\r\n"); f.git("add", ".");
  f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "filtered");
  const filtered = f.subject(); const projection = maintainContextProjection(filtered, filtered.paths(), f.state);
  assert.match(filtered.read("a.ts").toString(), /\r\n$/); assert.equal(projection.facts.get("a.ts")?.bytes, readFileSync(join(f.root, "a.ts")).length);
});

test("assume-unchanged bytes cannot reuse the Git blob and selected edits are rejected", t => {
  const f = fixture(t); f.write("a.ts", "export const before=1;\n"); f.git("add", ".");
  f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "source"); f.run();
  f.git("update-index", "--assume-unchanged", "a.ts"); f.write("a.ts", "export const after=2;\n");
  const subject = f.subject(), index = maintainContextProjection(subject, subject.paths(), f.state);
  assert.equal(index.status.reusedCount, 0); assert.match(index.entries.get("a.ts")!.text, /after/);
  f.write("a.ts", "export const racing=3;\n"); assert.throws(() => subject.read("a.ts"), /changed/);
});

test("partial refresh retains all paths and resumes; unsafe and binary paths never gain facts", t => {
  const f = fixture(t); for (let i = 0; i < 20; i++) f.write(`src/${i}.ts`, "export const x=1;\n".repeat(100));
  f.write(".env", "TOKEN=fixture"); f.write("binary.ts", "\0binary");
  const partial = f.run({ byteLimit: 2000 }); assert.equal(partial.status.inventoryCount, 21); assert.ok(partial.status.pendingCount > 0);
  assert.equal(partial.entries.has(".env"), false); assert.equal(partial.status.reverseCoverage, "partial");
  const complete = f.run(); assert.equal(complete.status.pendingCount, 0); assert.equal(complete.entries.has("binary.ts"), false);
});

test("SQLite writer contention, compare/publish race, schema failure and explicit rebuild are bounded", t => {
  const f = fixture(t); f.write("a.ts", "export const a=1;\n"); f.run();
  const db = new DatabaseSync(join(f.state, PROJECTION_FILE)); db.exec("BEGIN IMMEDIATE");
  const busy = f.run(); assert.equal(busy.status.cache, "published"); assert.equal(busy.status.reusedCount, 1); assert.equal(busy.capturedBytes, 0); db.exec("ROLLBACK");
  const locator = projectionIdentity(f.root)!;
  const store = new ProjectionStore(f.state, f.root, locator), snapshot = store.snapshot("worktree");
  const generation = { id: "other", view: "worktree", subject: null, locator, extractor: "test", complete: false, files: [] };
  assert.equal(store.publish(generation, new Map(), snapshot.id), true);
  assert.equal(store.publish({ ...generation, id: "loser" }, new Map(), snapshot.id), false); store.close();
  assert.equal(f.run({ rebuild: true }).status.extractedCount, 1);
  db.close();
  const current = new DatabaseSync(join(f.state, projectionStatus(f.state, f.root).file!));
  current.exec("PRAGMA user_version=999"); assert.equal(f.run().status.cache, "index-schema-unavailable"); current.close();
  assert.equal(f.run({ rebuild: true }).status.cache, "published");
});

test("separate worktrees and recreated admin identities cannot share a verified cache", t => {
  const f = fixture(t); f.write("a.ts", "export const a=1;\n"); f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "source");
  const first = f.run(); const sibling = join(f.base, "other"); f.git("worktree", "add", "--detach", sibling, "HEAD");
  writeFileSync(join(sibling, "a.ts"), "export const sibling=2;\n");
  const otherSubject = new ValidationSubject(sibling, resolveChangeScope(sibling, { baseRef: "HEAD" }), { workingTree: true });
  const other = maintainContextProjection(otherSubject, otherSubject.paths(), join(f.base, "other-state"));
  assert.notEqual(first.generation, other.generation); assert.match(other.entries.get("a.ts")!.text, /sibling/);
  assert.notEqual(projectionIdentity(sibling), projectionIdentity(f.root));
  const db = new DatabaseSync(join(f.state, PROJECTION_FILE)); db.prepare("UPDATE owner SET locator=?").run("fs:old"); db.close();
  assert.equal(projectionStatus(f.state, f.root).status, "identity-mismatch"); assert.equal(f.run().status.reusedCount, 0);
});

test("syntax ranges ignore quoted declarations; links remain explicit and ambiguous imports unresolved", () => {
  const fact = extractSourceFacts("src/a.ts", Buffer.from('const fake="export function imaginary() {}";\nimport {b} from "./b";\nexport function real(x: number) { return x; }\nimport("./lazy");\n'));
  assert.ok(fact.spans.some(span => span.name === "real" && span.start === 3)); assert.ok(!fact.spans.some(span => span.name === "imaginary"));
  const imported = fact.links.find(link => link.kind === "import")!, dynamic = fact.links.find(link => link.kind === "dynamic-import")!;
  assert.equal(resolveSourceLink("src/a.ts", imported, new Set(["src/b.ts"])).resolved, "src/b.ts");
  assert.equal(resolveSourceLink("src/a.ts", imported, new Set(["src/b.ts", "src/b.js"])).reason, "ambiguous");
  assert.equal(resolveSourceLink("src/a.ts", dynamic, new Set(["src/lazy.ts"])).reason, "dynamic");
  const markdown = extractSourceFacts("docs/a.md", Buffer.from("# Guide\n[Source](../src/a.ts)\n")); assert.equal(markdown.links[0]?.line, 2);
});

test("declared catalog and forward/reverse links provide one-hop discovery without guessing tests", t => {
  const f = fixture(t); f.write("config/governance/profile.yaml", "documentation: {root: docs/developer}\n");
  f.write("src/a.ts", 'import {b} from "./b";\nexport const a=b;\n'); f.write("src/b.ts", "export const b=1;\n");
  f.write("a.test.ts", "export const test=1;\n"); f.write("docs/guide.md", "# Guide\n[Owner](../src/b.ts)\n");
  f.write("docs/developer/catalog.yaml", JSON.stringify({ version: 1, capabilities: [{ id: "owner", title: "Owner", reference: "docs/guide.md", sources: ["src/b.ts", "a.test.ts"] }] }));
  const index = f.run({ exact: ["src/b.ts"] });
  assert.ok(index.priority.includes("src/a.ts")); assert.ok(index.priority.includes("a.test.ts")); assert.ok(index.priority.includes("docs/guide.md"));
  assert.ok(index.catalogLinks.some(link => link.source === "src/b.ts" && link.resolved === "a.test.ts"));
  const declaration = index.catalogLinks.find(link => link.source === "src/b.ts" && link.resolved === "a.test.ts")!;
  assert.equal(declaration.pointer, "/capabilities/0"); assert.equal(declaration.sourceDigest, index.facts.get("src/b.ts")?.digest);
  assert.equal(declaration.targetDigest, index.facts.get("a.test.ts")?.digest); assert.equal(declaration.declarationDigest, index.facts.get(declaration.origin)?.digest);
  rmSync(join(f.root, "src/b.ts")); assert.equal(f.run().links.find(link => link.source === "src/a.ts")?.resolved, null);
});

test("normalized repositories make progress and warm capacity persists by source key", t => {
  const f = fixture(t); f.write(".gitattributes", "*.ts text=auto\n");
  for (let i = 0; i < 20; i++) f.write(`${i}.ts`, `/** Description ${i}. */\nexport const item${i} = 1;\n`);
  f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "filtered");
  const subject = f.subject(), original = subject.read.bind(subject); let bodyReads = 0;
  subject.read = (path, limit) => { bodyReads++; return original(path, limit); };
  const observed = subject.projectionSources(subject.paths()); assert.equal(bodyReads, 0);
  assert.notEqual(observed.sources.get("0.ts")?.freshness, "unverified");
  const limited = maintainContextProjection(subject, subject.paths(), f.state, { byteLimit: 160 });
  assert.ok(limited.capturedBytes <= 160); assert.ok(limited.status.pendingCount > 0);
  f.write(".gitattributes", "*.ts -text\n"); f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "literal");
  const capacity = f.run({ factByteLimit: 900 }); assert.ok(capacity.unavailable.some(item => item.reason === "index-capacity"));
  const warm = f.run({ factByteLimit: 900 }); assert.equal(warm.status.extractedCount, 0); assert.equal(warm.capturedBytes, 0);
  assert.equal(warm.status.inventoryCount, 20); assert.equal(warm.status.complete, false);
});

test("signatures omit values and function locals; CommonJS and unresolved aliases remain explicit", () => {
  const locals = Array.from({ length: 100 }, (_, i) => `const local${i} = 'private';`).join("\n");
  const fact = extractSourceFacts("a.ts", Buffer.from(`const credential = 'DO_NOT_SEND';\nfunction outer() { ${locals} }\nexport function important(p = 'ALSO_PRIVATE'): string { return ''; }\nimport helper = require('./helper');\nconst other = require('@alias/other');\n`));
  assert.ok(fact.spans.some(span => span.name === "important")); assert.ok(!fact.spans.some(span => span.name === "local1"));
  assert.ok(!JSON.stringify(fact).includes("DO_NOT_SEND")); assert.ok(!JSON.stringify(fact).includes("ALSO_PRIVATE"));
  assert.ok(fact.links.some(link => link.kind === "require" && link.target === "./helper"));
  const alias = fact.links.find(link => link.target === "@alias/other")!;
  assert.equal(resolveSourceLink("a.ts", alias, new Set(["other.ts"])).reason, "package-or-alias");
  const markdown = extractSourceFacts("a.md", Buffer.from("# First\r\n```\r\n~~~\r\n# Hidden\r\n```\r\n# Last\r\n"));
  assert.deepEqual(markdown.spans.map(span => [span.name, span.start]), [["First", 1], ["Last", 6]]);
});

test("rebuild recovers corrupt and oversized caches without changing an active reader's snapshot", t => {
  const f = fixture(t); f.write("a.ts", "export const a=1;\n"); f.run();
  const reader = new DatabaseSync(join(f.state, PROJECTION_FILE)); reader.exec("BEGIN");
  const generation = reader.prepare("SELECT id FROM generation").get()!["id"];
  assert.equal(f.run({ rebuild: true }).status.cache, "published");
  assert.equal(reader.prepare("SELECT id FROM generation").get()!["id"], generation); reader.exec("COMMIT"); reader.close();
  let active = join(f.state, projectionStatus(f.state, f.root).file!); writeFileSync(active, "corrupt fixture");
  assert.equal(f.run().status.cache, "index-unavailable"); assert.equal(f.run({ rebuild: true }).status.cache, "published");
  active = join(f.state, projectionStatus(f.state, f.root).file!); truncateSync(active, PROJECTION_MAX_BYTES + 1);
  assert.equal(f.run().status.cache, "index-capacity-or-invalid-file"); assert.equal(f.run({ rebuild: true }).status.cache, "published");
});

test("a moved linked tree and a recreated pathname never reuse another tree's projection", t => {
  const f = fixture(t); f.write("a.ts", "export const a=1;\n"); f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "source");
  const old = join(f.base, "old"), moved = join(f.base, "moved"), state = join(f.base, "linked-state");
  f.git("worktree", "add", "--detach", old, "HEAD");
  const run = (root: string) => { const subject = new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" }), { workingTree: true }); return maintainContextProjection(subject, subject.paths(), state); };
  run(old); const identity = projectionIdentity(old); f.git("worktree", "move", old, moved);
  assert.equal(projectionStatus(state, f.root).status, "orphaned-workspace");
  assert.equal(projectionIdentity(moved), identity); assert.equal(run(moved).status.reusedCount, 0);
  f.git("worktree", "add", "--detach", old, "HEAD"); assert.notEqual(projectionIdentity(old), identity);
  assert.equal(run(old).status.reusedCount, 0);
});

test("a deeply nested source cannot prevent another file's usable context", t => {
  const f = fixture(t); f.write("deep.ts", "export const deep=" + "a+".repeat(12000) + "a;\n");
  f.write("simple.ts", "export function useful() {}\n");
  const index = f.run(); assert.equal(index.status.inventoryCount, 2); assert.ok(index.entries.has("simple.ts"));
  assert.ok(index.facts.has("deep.ts") || index.unavailable.some(item => item.path === "deep.ts" && item.reason === "extraction-failed"));
});

test("uncertain source reads rotate through pending paths and reuse byte-verified facts", t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) f.write(`${i}.ts`, `/** Item ${i}. */\nexport const item${i}=1;\n`);
  f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "sources");
  f.git("update-index", "--assume-unchanged", ...Array.from({ length: 12 }, (_, i) => `${i}.ts`));
  const seen = new Set<string>(); let reused = 0;
  for (let i = 0; i < 14; i++) {
    const result = f.run({ byteLimit: 110 });
    for (const path of result.facts.keys()) seen.add(path);
    assert.ok(result.capturedBytes <= 110); assert.equal(result.status.complete, false);
    reused += result.status.reusedCount;
  }
  assert.equal(seen.size, 12); assert.ok(reused > 0);
  const full = f.run(); assert.equal(full.status.extractedCount, 0); assert.equal(full.status.complete, true);
  f.write("0.ts", "export const changed=2;\n");
  const changed = f.run(); assert.equal(changed.status.extractedCount, 1); assert.match(changed.entries.get("0.ts")!.text, /changed/);
});
