import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contextBudgetReadiness } from "../src/context-budget-readiness.ts";
import { routeContext } from "../src/context-routing.ts";

test("mixed explicit and implicit totals use the largest actual owner native limit", t => {
  const root = mkdtempSync(join(tmpdir(), "context-readiness-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [total, expected] of [[5000, 24000], [8000, 32000], [14000, 56000]] as const) {
    const router = { routes: [
      { id: "intent", match: { product_terms: ["review", "project"] }, token_budget: { primary_context_tokens: total, total_context_tokens: total } },
      { id: "code", match: { path_globs: ["src/**"] } },
    ] };
    const routed = routeContext(router, "Review project", ["src/code.ts"]);
    assert.equal(routed.budgetAuthority.nativePacketBytes, expected);
    const readiness = contextBudgetReadiness(root, router);
    assert.equal(readiness.routes.find(route => route.owners.length === 2)!.limits.native, expected);
  }
});

test("doctor catches a mixed-route overflow even when each route fits alone", t => {
  const root = mkdtempSync(join(tmpdir(), "context-readiness-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, bytes] of [["AGENTS.md", 12420], ["topology.md", 14362], ["lifecycle.md", 1497]] as const) writeFileSync(join(root, name), "x".repeat(bytes));
  const router = { default_context: ["AGENTS.md"], default_route: "project", routes: [
    { id: "project" },
    { id: "topology", match: { path_globs: ["infra/**"] }, primary_context: ["topology.md"], token_budget: { primary_context_tokens: 7000, total_context_tokens: 18000 } },
    { id: "docs", match: { path_globs: ["docs/**"] }, primary_context: ["lifecycle.md"] },
  ] };
  const before = contextBudgetReadiness(root, router);
  assert.ok(before.routes.filter(route => route.owners.length === 1).every(route => route.status === "fits"));
  const mixed = before.routes.find(route => route.owners.includes("topology") && route.owners.includes("docs"))!;
  assert.equal(mixed.used.primary, 28279); assert.equal(mixed.remaining.primary, -279); assert.equal(mixed.status, "over-budget");
  router.routes[1]!.token_budget!.primary_context_tokens = 8500;
  const repaired = contextBudgetReadiness(root, router);
  assert.ok(repaired.routes.every(route => route.status === "fits")); assert.equal(repaired.coverage.truncated, false);
  assert.deepEqual(repaired.requiredGuidance.map(item => item.path).sort(), ["AGENTS.md", "lifecycle.md", "topology.md"]);
  rmSync(join(root, "lifecycle.md"));
  assert.ok(contextBudgetReadiness(root, router).findings.some(item => item.id === "context.required-unavailable"));
});

test("readiness declares bounded scenario coverage instead of claiming exhaustive combinations", t => {
  const root = mkdtempSync(join(tmpdir(), "context-readiness-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = contextBudgetReadiness(root, { default_route: "r0", routes: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, match: { path_globs: [`src${i}/**`] } })) });
  assert.equal(result.coverage.truncated, true); assert.equal(result.routes.length, 256);
  assert.ok(result.findings.some(item => item.id === "context.budget-inspection-partial"));
});

test("a selected default route never acquires an imaginary smaller unowned envelope", t => {
  const root = mkdtempSync(join(tmpdir(), "context-readiness-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "AGENTS.md"), "x".repeat(31200));
  const result = contextBudgetReadiness(root, { default_context: ["AGENTS.md"], default_route: "project", routes: [{ id: "project",
    token_budget: { primary_context_tokens: 9000, total_context_tokens: 14000 } }] });
  assert.equal(result.routes.length, 1); assert.equal(result.routes[0]!.status, "fits");
});

test("readiness includes a term-selected owner with two path owners and flags larger unchecked subsets", t => {
  const root = mkdtempSync(join(tmpdir(), "context-readiness-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ["intent", "code", "docs", "large"]) writeFileSync(join(root, `${name}.md`), "x".repeat(700));
  const budget = { primary_context_tokens: 500, active_plan_context_tokens: 1, expansion_context_tokens: 1, total_context_tokens: 2500 };
  const routes = [
    { id: "intent", match: { product_terms: ["intent"] }, primary_context: ["intent.md"], token_budget: budget },
    ...["code", "docs"].map(id => ({ id, match: { path_globs: [`${id}/**`] }, primary_context: [`${id}.md`], token_budget: budget })),
  ];
  const result = contextBudgetReadiness(root, { default_route: "intent", routes });
  assert.equal(result.routes.find(route => route.owners.length === 3)!.status, "over-budget");
  assert.equal(result.coverage.arbitraryRouteSubsets, "complete-declared-owner-sets");
  const larger = contextBudgetReadiness(root, { default_route: "intent", routes: [...routes,
    { id: "large", match: { path_globs: ["large/**"] }, primary_context: ["large.md"], token_budget: { ...budget, primary_context_tokens: 2000 } }] });
  assert.equal(larger.coverage.truncated, false);
  assert.ok(larger.findings.some(item => item.id === "context.budget-combinations-unchecked"));
});
