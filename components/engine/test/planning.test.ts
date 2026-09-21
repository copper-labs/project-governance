import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPacks, mergePacks } from "../src/pack-configuration.ts";
import { buildPlan, matchesPackPath } from "../src/planning.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const builtin = fileURLToPath(new URL("../../../src/project_governance_runtime/packs", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/planning-parity.json", import.meta.url), "utf8"));

test("all shipped pack selections match retained Python output fixtures", () => {
  const packs = loadPacks(root, builtin);
  assert.equal(Object.keys(packs).filter(id => packs[id]!._origin === "builtin").length, 13);
  for (const entry of fixture.cases) assert.deepEqual(JSON.parse(JSON.stringify(buildPlan(packs, entry.options))), entry.expected);
});

const document = (id: string, extra: Record<string, unknown> = {}, origin: "builtin" | "target" = "builtin") => ({
  source: `${id}.yaml`, origin, value: { enforcement: "blocking", stages: ["pre-commit"], path_globs: ["**/*.ts"], commands: [{ builtin: "fixture" }], ...extra, id },
});

test("unconfigured stages block empty success while target-defined stages remain supported", () => {
  const packs = mergePacks([document("core"), document("custom", { stages: ["device-qualification"] }, "target")]);
  for (const mode of ["all", "impacted"] as const) {
    const plan = buildPlan(packs, { stage: "pre-comit", mode, changedPaths: [] });
    assert.equal(plan.status, "blocked");
    assert.equal(plan.blockers[0]!["code"], "unknown-stage");
    assert.deepEqual(plan.execution_order, []);
  }
  const custom = buildPlan(packs, { stage: "device-qualification", mode: "all", changedPaths: [] });
  assert.equal(custom.status, "ready");
  assert.deepEqual(custom.execution_order, ["custom"]);
});

test("target replacement preserves coverage and cannot weaken or duplicate ownership", () => {
  const core = document("core"), replacement = document("target", { replaces_builtin_packs: ["core"], change_packet_contract: 1, path_globs: ["app/*.ts"] }, "target");
  const packs = mergePacks([core, replacement]);
  const good = buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: ["app/main.ts"] });
  assert.deepEqual(good.selected_packs, ["target"]); assert.equal(good.status, "ready");
  const gap = buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: ["lib/main.ts"] });
  assert.equal(gap.blockers[0]!["code"], "replacement-coverage-gap");
  assert.throws(() => mergePacks([core, { ...replacement, value: { ...replacement.value, enforcement: "advisory" } }]), /cannot replace blocking/);
  assert.throws(() => mergePacks([core, replacement, document("other", replacement.value, "target")]), /duplicate replacers/);
  assert.throws(() => mergePacks([document("core", { impact_role: "supplemental" }), replacement]), /supplemental/);
  assert.throws(() => mergePacks([core, replacement, document("dependent", { depends_on: ["core"] })]), /depend on the target owner/);
});

test("dependencies run first; cycles, missing dependencies and empty stage coverage block", () => {
  const packs = mergePacks([document("first", { path_globs: [] }), document("second", { depends_on: ["first"] })]);
  assert.deepEqual(buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: ["a.ts"] }).execution_order, ["first", "second"]);
  packs["first"]!.depends_on = ["second"];
  assert.equal(buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] }).blockers[0]!["code"], "invalid-dependency-graph");
  packs["first"]!.depends_on = ["missing"];
  assert.equal(buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] }).status, "blocked");
  packs["first"]!.depends_on = [];
  packs["second"]!.commands = [{ run: ["node", "check.js"], stages: ["ci-pr"] }];
  assert.equal(buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] }).blockers[0]!["code"], "pack-stage-without-command");
});

test("path patterns preserve recursive roots, slash matching and character classes", () => {
  assert.equal(matchesPackPath("README.md", ["**/*.md"]), true);
  assert.equal(matchesPackPath("a/b/c.ts", ["a/*.ts"]), true);
  assert.equal(matchesPackPath("test7.ts", ["test[0-9].ts"]), true);
  assert.equal(matchesPackPath("testx.ts", ["test[!0-9].ts"]), true);
  assert.equal(matchesPackPath("test7.ts", ["test[!0-9].ts"]), false);
  assert.equal(matchesPackPath("a[.ts", ["a[.ts"]), true);
});
