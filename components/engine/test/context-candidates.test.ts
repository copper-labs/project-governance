/** Candidate allocation and preview regressions, independent of route-command execution. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { automaticContextCandidates } from "../src/context-candidates.ts";
import type { ValidationSubject } from "../src/change-subject.ts";

test("a narrow candidate cap retains changed files beside stronger filename matches", () => {
  const paths = ["docs/login-timeout-guide.md", "docs/login-timeout-history.md",
    "docs/login-timeout-migration.md", "docs/changed.md", "docs/late.md"];
  const subject = { source: () => ({ file_type: "regular" }) } as unknown as ValidationSubject;
  const priority = { purpose: "Fix login timeout", exact: [] as string[], changed: ["docs/changed.md"] };
  const result = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 2, priority);
  assert.equal(result.seeds.length, 2);
  assert.equal(result.seeds[0], "docs/changed.md");
  assert.ok(result.seeds[1]?.includes("login-timeout"));
  const exact = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 2,
    { ...priority, exact: ["docs/late.md"] });
  assert.deepEqual(exact.seeds, ["docs/late.md", "docs/changed.md"]);
  const saturated = automaticContextCandidates(subject,
    ["docs/changed-1.md", "docs/changed-2.md", "docs/changed-3.md", "docs/login-timeout-guide.md"],
    new Set(), ["docs/**"], 2, { ...priority,
      changed: ["docs/changed-1.md", "docs/changed-2.md", "docs/changed-3.md"] });
  assert.deepEqual(saturated.seeds, ["docs/changed-1.md", "docs/changed-2.md"]);
  assert.ok(!saturated.seeds.includes("docs/login-timeout-guide.md"));
  assert.ok(saturated.omittedCount > 0);
  assert.equal(saturated.priorityPreview.find(item => item.path === "docs/changed-3.md")?.disposition,
    "not-inspected-seed-cap");
});

test("priority preview shows related discoveries outside the initial task scope", () => {
  const paths = ["src/feature/a.ts", "package.json", "README.md", "test/feature.test.ts"];
  const subject = { root: "/fixture", paths: () => paths,
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: (path: string) => Buffer.from(path === "package.json" ? '{"name":"fixture"}' : "source") } as unknown as ValidationSubject;
  const priority = { purpose: "Investigate feature", exact: [] as string[], changed: [] as string[] };
  const result = automaticContextCandidates(subject, ["src/feature/a.ts"], new Set(), ["**"], 8, priority);
  assert.ok(result.paths.includes("README.md"));
  assert.equal(result.priorityPreview.find(item => item.path === "README.md")?.disposition, "discovered");
  const saturated = automaticContextCandidates(subject, ["src/feature/a.ts"], new Set(), ["**"], 1, priority);
  assert.equal(saturated.discovery, null, "A full source allocation must not scan for results it cannot deliver");
});

test("priority preview reserves room for seeds after many excluded paths", () => {
  const paths = [...Array.from({ length: 70 }, (_, index) => `src/a${index}.ts`),
    ...Array.from({ length: 40 }, (_, index) => `docs/b${index}.md`)];
  const subject = { root: "/fixture", paths: () => paths,
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: () => Buffer.from("source") } as unknown as ValidationSubject;
  const result = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 32,
    { purpose: "review", exact: [], changed: [] });
  assert.equal(result.seeds.length, 32);
  assert.ok(result.seeds.every(path => result.priorityPreview.some(item =>
    item.path === path && item.disposition === "seeded")));
  assert.ok(result.priorityPreview.length > 64);
  assert.ok(result.priorityPreview.length <= 128);
});

test("priority preview retains every discovery after excluded leaders and 32 seeds", () => {
  const excluded = Array.from({ length: 16 }, (_, index) => `src/changed-${index}.ts`);
  const seeds = Array.from({ length: 32 }, (_, index) => `docs/seed-${index}.ts`);
  const related = Array.from({ length: 20 }, (_, index) => `docs/related-${index}.md`);
  const subject = { root: "/fixture", paths: () => [...excluded, ...seeds, ...related],
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: () => Buffer.from("source") } as unknown as ValidationSubject;
  const result = automaticContextCandidates(subject, [...excluded, ...seeds], new Set(), ["docs/**"], 64,
    { purpose: "review", exact: [], changed: excluded });
  assert.equal(result.seeds.length, 32);
  assert.equal(result.discovery?.paths.length, 20);
  assert.ok(result.discovery?.paths.every(path => result.priorityPreview.some(item =>
    item.path === path && item.disposition === "discovered")));
  assert.ok(result.priorityPreview.length >= 68);
});
