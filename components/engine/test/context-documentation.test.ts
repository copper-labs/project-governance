import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { sourceDescription } from "../src/context-source-index.ts";
import { maintainContextProjection } from "../src/context-projection.ts";
import { documentationReadiness } from "../src/context-documentation.ts";
import { contextObservationStatus } from "../src/context-observations.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { documentLinkIssues } from "../src/checkers/document-links.ts";
import { digest, durableJson } from "../src/core.ts";

test("index gaps distinguish literal clues from documentation and telemetry preserves snapshot limits", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-documentation-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q");
    writeFileSync(join(root, "symbols.ts"), "export function renewExpiredCredentials() {}\n");
    writeFileSync(join(root, "explained.py"), '"""Refresh credentials before forwarding the current request."""\ndef renew(): pass\n');
    writeFileSync(join(root, "heading.md"), "# Credential cache\n");
    writeFileSync(join(root, "settings.json"), '{"enabled":true}\n');
    const subject = new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" }));
    const index = maintainContextProjection(subject, subject.paths(), contextStateRoot(root));
    assert.match(index.entries.get("symbols.ts")!.text, /renewExpiredCredentials/);
    assert.equal(index.documentation.inspectedCount, 3);
    assert.equal(index.documentation.overviewCount, 1);
    assert.deepEqual(index.documentation.gaps.map(item => item.path).sort(), ["heading.md", "symbols.ts"]);
    assert.ok(index.documentation.gaps.every(item => !JSON.stringify(item).includes("renewExpiredCredentials")));
    assert.equal(contextObservationStatus(root).documentation.status, "not-observed");
    const state = contextStateRoot(root);
    for (const turn of ["first", "second"]) {
      const entryId = digest(turn).slice(7);
      durableJson(join(state, "prompt-entries", `${entryId}.json`), { entryId, workspace: root, createdAt: "2026-09-25T12:00:00Z",
        sourceIndex: { documentation: { status: "observed-subset", candidates: index.documentation.gaps, candidatesTruncated: false } } });
    }
    writeFileSync(join(root, "symbols.ts"), "/** Different current source. */\nexport function renamed() {}\n");
    const report = contextObservationStatus(root).documentation;
    assert.equal(report.observedEntries, 2); assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates[0]?.observations, 2);
    assert.match(report.freshness, /revalidate/); assert.equal(report.qualityVerdict, "not-established");
    assert.equal(report.candidates.find(item => item.path === "symbols.ts")?.sourceDigest, index.entries.get("symbols.ts")?.sourceDigest);
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("passive documentation readiness uses the qualified checker registry and rejects unsupported active claims", () => {
  const root = mkdtempSync(join(tmpdir(), "documentation-readiness-"));
  try {
    const assets = resolve("src/project_governance_runtime/defaults");
    const ready = documentationReadiness(root, assets);
    assert.equal(ready.status, "configured"); assert.deepEqual(ready.activeLanguages, ["python", "kotlin"]);
    assert.ok(ready.advisoryLanguages?.includes("typescript")); assert.equal(ready.mode, "report-existing-enforce-touched");
    mkdirSync(join(root, "config/policies"), { recursive: true });
    writeFileSync(join(root, "config/policies/source-comment-adapters.yaml"), "version: 1\nowner: fixture\nadapters: [{language: typescript, status: active, analyzer: invented}]\n");
    const invalid = documentationReadiness(root, assets);
    assert.equal(invalid.status, "invalid-configuration"); assert.deepEqual(invalid.activeLanguages, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("selected document summaries cannot be empty while untouched legacy debt remains outside the gate", () => {
  const root = mkdtempSync(join(tmpdir(), "documentation-summary-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    mkdirSync(join(root, "docs")); writeFileSync(join(root, "docs/old.md"), "---\nid: old\ntitle: ''\nsummary: ''\ntype: guide\nstatus: current\nowner: fixture\ncreated: 2026-09-25\nupdated: 2026-09-25\n---\n# Old debt\n");
    git("add", "."); git("commit", "-qm", "base");
    const inventory = resolveChangeScope(root, { all: true });
    assert.deepEqual(documentLinkIssues(new ValidationSubject(root, inventory), inventory), [], "A broad inventory has no change provenance for the new description rule");
    const content = (summary: string) => `---\nid: feature\ntitle: Feature\ntype: guide\nstatus: current\nowner: fixture\ncreated: 2026-09-25\nupdated: 2026-09-25\nsummary: ${summary}\n---\n# Feature\n`;
    writeFileSync(join(root, "docs/new.md"), content('""')); git("add", "docs/new.md");
    const check = () => { const scope = resolveChangeScope(root, { staged: true }); return documentLinkIssues(new ValidationSubject(root, scope), scope); };
    assert.deepEqual(check(), ["docs/new.md: summary must be a non-empty string"]);
    writeFileSync(join(root, "docs/new.md"), content("Explains how expiring credentials are renewed before requests.")); git("add", "docs/new.md");
    assert.deepEqual(check(), []);
    writeFileSync(join(root, "docs/old.md"), content('""').replace("id: feature", "id: old")); git("add", "docs/old.md");
    assert.deepEqual(check(), ["docs/old.md: summary must be a non-empty string"], "Touching legacy documentation brings it into the new rule");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("literal documentation skips directives and licenses while finding prose after common preambles", () => {
  const clues = (path: string, source: string) => JSON.parse(sourceDescription(path, Buffer.from(source)) ?? "{}");
  for (const [path, source] of [
    ["plain.c", "#include <stdio.h>\n#pragma once\n"],
    ["plain.rs", "#![allow(dead_code)]\n#[derive(Debug)]\nstruct Entry {}\n"],
    ["plain.py", "# -*- coding: utf-8 -*-\ndef launch(): pass\n"],
    ["plain.ts", "// eslint-disable\n// @ts-nocheck\nexport const value = 1;\n"],
  ]) assert.ok(!clues(path!, source!).documentation, path);
  for (const [path, source] of [
    ["feature.kt", "/* Copyright Example. */\npackage example\nimport example.Clock\n/** Renew credentials before forwarding requests. */\nclass Session {}\n"],
    ["feature.ts", "// @ts-nocheck\nimport { clock } from './clock';\n/** Renew credentials before forwarding requests. */\nexport class Session {}\n"],
    ["feature.py", "#!/usr/bin/python3\n# -*- coding: utf-8 -*-\n\"\"\"Renew credentials before forwarding requests.\"\"\"\ndef renew(): pass\n"],
    ["feature.ts", '// Copyright Example\n// Licensed under the Apache License, Version 2.0\n' + '// you may not use this file except in compliance with the License.\n'.repeat(14) + '\n/** Renew credentials before forwarding requests. */\nexport class Session {}\n'],
    ["feature.py", '# Copyright Example\n# Permission is hereby granted to use this software.\n' + '# The above notice shall be included in all copies.\n'.repeat(14) + '\n"""Renew credentials before forwarding requests."""\ndef renew(): pass\n'],
    ["feature.h", '#ifndef SESSION_H\n#define SESSION_H\n/** Renew credentials before forwarding requests. */\nstruct Session {};\n'],
    ["feature.ts", '"use client";\n/** Renew credentials before forwarding requests. */\nexport class Session {}\n'],
  ]) assert.match(clues(path!, source!).documentation, /Renew credentials/, path);
});
