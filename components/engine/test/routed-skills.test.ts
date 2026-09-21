import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogSkill } from "../src/skill-catalog.ts";
import { routeContext } from "../src/context-routing.ts";
import { materializeRoutedSkills } from "../src/routed-skills.ts";
import { materializeRoutedContext } from "../src/routed-context.ts";
import type { ValidationSubject } from "../src/change-subject.ts";

const skill = (id: string, overrides: Partial<CatalogSkill> = {}): CatalogSkill => ({ id, path: `${id}.md`,
  sourceDigest: "sha256:test", content: "rule", packId: "pack", activationMode: "governed", defaultLevel: "required",
  capabilityOwner: null, applicability: { task_terms: ["fix"] }, conflicts: [], references: [], routerFor: [], ...overrides });
const route = (skills: string[]) => routeContext({ routes: [{ id: "fix", match: { prompt_terms: ["fix"] }, skills }] }, "fix", []);

test("packet readiness requires delivered skills and reports unavailable or conflicting requirements", () => {
  const index = new Map([skill("a", { conflicts: ["b"] }), skill("b")].map(item => [item.id, item]));
  assert.deepEqual(materializeRoutedSkills(index, route(["unknown"]), "fix", [], null).blockers, ["skill-unavailable:unknown"]);
  assert.deepEqual(materializeRoutedSkills(index, route(["a", "b"]), "fix", [], null).blockers, ["skill-conflict:a:b"]);
  const packet = materializeRoutedContext({} as ValidationSubject, route(["a"]), false,
    { index, task: "fix", changedPaths: [], facts: null });
  assert.equal(packet.ready, true);
  assert.equal(packet.skills?.entries[0]?.content, "rule");
});

test("required leaves retain budget ahead of recommendations and omissions block only required skills", () => {
  const index = new Map([
    skill("router", { routerFor: ["pack"], packId: null }),
    skill("optional", { defaultLevel: "recommended", content: "x".repeat(15000) }),
    skill("required", { content: "y".repeat(10000) }),
  ].map(item => [item.id, item]));
  const result = materializeRoutedSkills(index, route(["router"]), "fix", [], {});
  assert.equal(result.ready, true);
  assert.deepEqual(result.entries.map(item => item.id), ["router", "required"]);
  assert.deepEqual(result.omissions.map(item => item.id), ["optional"]);
  index.set("required", skill("required", { content: "y".repeat(17000) }));
  assert.equal(materializeRoutedSkills(index, route(["router"]), "fix", [], {}).ready, false);
});

test("default router declarations do not activate route-local automatic composition", () => {
  const index = new Map([skill("router", { routerFor: ["pack"], packId: null }), skill("leaf")].map(item => [item.id, item]));
  const selected = routeContext({ default_skills: ["router"], routes: [{ id: "fix", match: { prompt_terms: ["fix"] } }] }, "fix", []);
  assert.deepEqual(materializeRoutedSkills(index, selected, "fix", [], {}).entries.map(item => item.id), ["router"]);
});

test("target skills fill unknown declarations but cannot replace a packaged skill", () => {
  const index = new Map([["packaged", skill("packaged")]]);
  const requested: string[] = [];
  const result = materializeRoutedSkills(index, route(["packaged", "local"]), "fix", [], null, false, id => {
    requested.push(id);
    return skill(id, { content: "target-owned guidance", packId: null });
  });
  assert.deepEqual(requested, ["local"]);
  assert.equal(result.ready, true);
  assert.equal(result.entries[0]?.content, "rule");
  assert.equal(result.entries[1]?.content, "target-owned guidance");
});
