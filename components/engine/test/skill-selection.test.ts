import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadSkillCatalog, type CatalogSkill } from "../src/skill-catalog.ts";
import { selectAttachedSkills } from "../src/skill-selection.ts";

test("skill selection preserves legacy decisions across the actual packaged catalog", () => {
  const index = loadSkillCatalog(resolve("src/project_governance_runtime/assets/skills"));
  const routers = [...index.values()].filter(skill => skill.routerFor.length).map(skill => skill.id);
  const legacy = Object.fromEntries([...index].map(([id, skill]) => [id, { id, applicability: skill.applicability,
    pack_id: skill.packId, router_for: skill.routerFor, activation_mode: skill.activationMode,
    default_level: skill.defaultLevel, conflicts: skill.conflicts }]));
  const cases = [
    { task: "Fix React Native iOS build and test execution", paths: ["apps/mobile/ios/App.swift", "src/index.ts"], facts: {} },
    { task: "release native library and publish package", paths: ["build.gradle.kts"], facts: { ecosystems: ["kotlin", "swift"], target_families: ["ios", "android"] } },
    { task: "database migration security review", paths: ["supabase/migrations/schema.sql"], facts: { ecosystems: ["typescript"], target_families: ["web"] } },
    { task: "unrelated", paths: [], facts: {} },
  ];
  const script = "import json,sys\nfrom project_governance_runtime.skill_selection import select_attached_skills\nx=json.load(sys.stdin)\nr=select_attached_skills(x['index'],x['routers'],x['task'],x['paths'],x['facts'])\nr['selected']=[{'id':s['id'],'selectionReasons':s['selection_reasons']} for s in r['selected']]\nprint(json.dumps(r))";
  for (const entry of cases) {
    const actual = selectAttachedSkills(index, routers, entry.task, entry.paths, entry.facts);
    const expected = JSON.parse(execFileSync("python3", ["-c", script], {
      input: JSON.stringify({ index: legacy, routers, ...entry }), encoding: "utf8", timeout: 10000,
      env: { ...process.env, PYTHONPATH: resolve("src") },
    }));
    assert.deepEqual(actual.selected.map(skill => ({ id: skill.id, selectionReasons: skill.selectionReasons })), expected.selected);
    assert.deepEqual(actual.exclusions, expected.exclusions);
    assert.deepEqual(actual.unresolvedFacts, expected.unresolved_facts);
    assert.deepEqual(actual.conflicts, expected.conflicts);
  }
});

test("attached selection requires facts, exposes conflicts and gates evaluation skills", () => {
  const skill = (id: string, overrides: Partial<CatalogSkill> = {}): CatalogSkill => ({ id, path: `${id}.md`,
    sourceDigest: "sha256:test", content: "skill", packId: "mobile", activationMode: "governed", defaultLevel: "required",
    capabilityOwner: null, applicability: { task_terms: ["ios"], require_facts: { ecosystems: ["swift"] } }, conflicts: [], references: [], routerFor: [], ...overrides });
  const index = new Map([skill("router", { routerFor: ["mobile"], packId: null }), skill("a", { conflicts: ["b"] }), skill("b"),
    skill("eval", { activationMode: "evaluation-only" })].map(skill => [skill.id, skill]));
  assert.equal(selectAttachedSkills(index, [], "ios", [], {}).selected.length, 0);
  assert.equal(selectAttachedSkills(index, ["router"], "bios", [], {}).selected.length, 0);
  assert.deepEqual(selectAttachedSkills(index, ["router"], "ios", [], {}).unresolvedFacts, ["ecosystems"]);
  const result = selectAttachedSkills(index, ["router"], "ios", [], { ecosystems: ["swift"] });
  assert.deepEqual(result.selected.map(skill => skill.id), ["a", "b"]);
  assert.deepEqual(result.conflicts, ["a:b"]);
  assert.equal(selectAttachedSkills(index, ["router"], "ios", [], { ecosystems: ["swift"] }, true).selected.length, 3);
});
