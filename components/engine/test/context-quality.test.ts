import { wireMetadataEvidence } from "./fixtures/context-wire.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sourceClues } from "../src/context-source-index.ts";
import { extractSourceFacts } from "../src/context-source-facts.ts";
import { localContextPath } from "../src/context-path-policy.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { contextMetadataCatalog, selectContextMetadata } from "../src/context-metadata.ts";
import { automaticContextCandidates } from "../src/context-candidates.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import type { ValidationSubject } from "../src/change-subject.ts";
import { digest } from "../src/core.ts";
import { promptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";

test("multiline summaries retain authored meaning and declared lifecycle without trusting fenced headings", () => {
  const clues = sourceClues("docs/old.md", Buffer.from("---\nsummary: |\n  Cancels the previous session\n  without releasing its replacement.\nstatus: superseded\nsuperseded_by: current.md\n---\n```md\n# False authority\n```\n# Historical cancellation\n"))!;
  const value = JSON.parse(clues.text!);
  assert.match(value.documentation, /previous session without releasing/);
  assert.deepEqual(value.lifecycle, { status: "superseded", superseded_by: "current.md" });
  assert.deepEqual(value.headings, ["Historical cancellation"]);
  assert.equal(clues.overviewObserved, true);
  for (const summary of ["|", "'|'", "null", "'TBD'"]) {
    assert.equal(sourceClues("docs/empty.md", Buffer.from(`---\nsummary: ${summary}\n---\n# Placeholder\n`))!.overviewObserved, false);
  }
  assert.equal(JSON.parse(sourceClues("docs/bad.md", Buffer.from("---\nsummary: first\nsummary: duplicate\n---\n# Broken\n"))!.text!).metadataStatus, "invalid");
});

test("deep native paths and source variants remain eligible without admitting unsafe payloads", () => {
  for (const path of ["src/component.vue", "src/component.svelte", "src/main.mts", "src/main.cts", `modules/${"nested/".repeat(25)}Feature.swift`]) assert.equal(localContextPath(path), true, path);
  for (const path of ["../private.ts", "src/../private.ts", "src/generated/output.ts", "secrets/token.ts", "src/.env", "src/code.ts\n", "src/" + "a".repeat(4100) + ".ts"]) assert.equal(localContextPath(path), false, path);
  const native = extractSourceFacts("src/Session.kt", Buffer.from("/** Stop old work without touching the new session. */\ninternal suspend fun cancelPrevious() {}\nfun startReplacement() {}\n"));
  assert.equal(native.coverage, "heuristic");
  assert.deepEqual(native.spans.map(span => span.name), ["cancelPrevious", "startReplacement"]);
  assert.equal(extractSourceFacts("src/main.mts", Buffer.from("export function run() {}\n")).coverage, "syntax");
  assert.equal(extractSourceFacts("src/view.svelte", Buffer.from("<h1>Session</h1>\n")).coverage, "heuristic");
});

test("separate requested sections fit one bounded packet with exact source ranges", () => {
  const lines = ["# Current implementation\n", "The current code uses one dependency.\n", ...Array(100).fill("unrelated historical detail\n"),
    "# Proposed boundaries\n", "The proposed product would split dependencies.\n", ...Array(100).fill("unrelated future detail\n")];
  const candidate = { id: "docs/design.md", sourceDigest: "whole-source", excerpt: lines.join("") };
  const facts = extractSourceFacts(candidate.id, Buffer.from(candidate.excerpt));
  const excerpt = contextExcerpt(candidate, "Compare current implementation with proposed boundaries", 700, facts.spans);
  assert.equal(excerpt.sourceRange, undefined);
  assert.equal(excerpt.sourceRanges?.length, 2);
  assert.match(excerpt.excerpt, /current code uses/); assert.match(excerpt.excerpt, /proposed product would/);
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= 700);
  for (const range of excerpt.sourceRanges!) {
    const original = lines.slice(range.firstLine - 1, range.lastLine).join("");
    assert.ok(excerpt.excerpt.includes(original));
    assert.equal(range.totalLines, lines.length);
  }
});

test("test labels describe behavior without evaluating expressions; capped sections stop at the next boundary", () => {
  const facts = extractSourceFacts("src/session.test.ts", Buffer.from("const fixture = {};\ntest('cancels only the owned session', () => {});\nit.skip(`keeps replacement alive`, () => {});\ntest(getLabel(), () => {});\n"));
  const descriptor = JSON.parse(facts.descriptor!);
  assert.deepEqual(descriptor.declaredTestLabels, ["cancels only the owned session", "keeps replacement alive"]);
  assert.deepEqual(descriptor.symbols, ["fixture"]);
  assert.deepEqual(descriptor.signatures, ["fixture"]);
  assert.equal(descriptor.symbolsOmitted, 0);
  assert.equal(facts.spans.filter(span => span.kind === "literal-test-label").length, 2);
  const many = extractSourceFacts("test/labels.ts", Buffer.from(Array.from({ length: 9 }, (_, i) => `test('case ${i}', () => {});`).join("\n")));
  assert.equal(JSON.parse(many.descriptor!).declaredTestLabels.length, 8);
  assert.equal(many.coverage, "syntax-partial", "omitted literal labels must be disclosed");
  for (const [path, declaration] of [["docs/large.md", (i: number) => `# Section ${i}\nbody\n`], ["src/Large.kt", (i: number) => `fun function${i}() {}\n// details\n`]] as const) {
    const capped = extractSourceFacts(path, Buffer.from(Array.from({ length: 100 }, (_, i) => declaration(i)).join("")));
    assert.equal(capped.spans.length, 96); assert.equal(capped.spans.at(-1)!.end, 192);
    assert.equal(JSON.parse(capped.descriptor!).spanLimitReached, true);
  }
});

test("positive scores rank optional deep paths while explicit paths remain pinned", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-quality-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const deep = `src/${"native/".repeat(25)}correct.swift`, paths = ["src/pinned.ts", "src/near.ts", deep];
  const subject = { root, source: () => ({ file_type: "regular" }),
    projectionSources: (paths: string[]) => ({ view: "worktree", subject: null, sources: new Map(paths.map(path => [path, { key: path, freshness: "fixture" }])) }),
    readBatch: (paths: string[]) => new Map(paths.map(path => [path, "fixture-path-only"])),
  } as unknown as ValidationSubject;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata"], allowed_metadata_paths: ["src/**"],
    consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const path = wireMetadataEvidence(wire, raw).id;
      return [name, { type: "noul", noul: path === deep ? 0.99 : 0.8 }];
    })) });
  } });
  const result = await selectContextMetadata(subject, contextMetadataCatalog(paths, "near", [paths[0]!], [], new Set()), "near", runtime,
    { workspace: root, taskId: "quality", taskRevision: "1" }, digest(paths), "quality");
  assert.deepEqual(result.order, [paths[0], deep, paths[1]]);
  assert.equal(result.coverage.answeredCount, 3);
  const captured = automaticContextCandidates(subject, paths, new Set(), ["**"], 3,
    { purpose: "near", exact: [], changed: [], ordered: result.order });
  assert.ok(captured.paths.includes(deep), "Long eligible paths must survive actual source capture after ranking");
});

test("the complete source window follows assessed metadata order beyond its thirty-second file", () => {
  const paths = Array.from({ length: 96 }, (_, index) => `src/module-${String(index).padStart(3, "0")}.ts`);
  const ranked = [...paths].reverse();
  const subject = { source: () => ({ file_type: "regular" }), paths() { throw new Error("Unused discovery must not replace ranked files"); } } as unknown as ValidationSubject;
  const request = { purpose: "Repair pending work", exact: [], changed: [], ordered: ranked };
  const full = automaticContextCandidates(subject, paths, new Set(), ["**"], 64, request);
  assert.deepEqual(full.paths, ranked.slice(0, 64));
  assert.equal(full.discovery, null);
  assert.deepEqual(automaticContextCandidates(subject, paths, new Set(), ["**"], 16, request).paths, ranked.slice(0, 16), "An explicit smaller allowance is still respected");
});

test("native prompt entry preserves intent beyond the old character limit", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "long-prompt-quality-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(join(root, "config/governance"), { recursive: true });
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "base", routes: [
    { id: "base" }, { id: "tail", match: { prompt_terms: ["tailneedle"] } },
  ] } }));
  writeFileSync(join(root, "tail.ts"), "export function tailneedle() {}\n");
  await promptContext("codex", { hook_event_name: "UserPromptSubmit", session_id: "host", turn_id: "turn", cwd: root,
    prompt: "unrelated background ".repeat(1000) + "Find tailneedle at the end." }, root,
  { environment: {}, assetRoot: resolve("src/project_governance_runtime/assets/skills") });
  const state = contextStateRoot(root), folder = join(state, "prompt-entries");
  const entry = JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]!), "utf8"));
  assert.equal(entry.currentPromptComplete, true); assert.equal(entry.retrievalPurposeClipped, false);
  assert.equal(entry.status, "prepared");
  const route = JSON.parse(readFileSync(join(state, "routes", `${entry.routeReceiptId}.json`), "utf8"));
  assert.equal(route.route, "tail");
});
