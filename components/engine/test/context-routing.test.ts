import { test } from "node:test";
import assert from "node:assert/strict";
import { routeContext } from "../src/context-routing.ts";
test("required routing uses path and whole-term signals and retains mandatory groups", () => {
  const router = { default_context: ["AGENTS.md"], routes: [
    { id: "ios", match: { path_globs: ["ios/*"], product_terms: ["iOS"] }, primary_context: ["ios/rules.md"], active_plan_context: ["plan.md"], skills: ["apple"], validations: ["native"] },
    { id: "web", match: { prompt_terms: ["web"] }, primary_context: ["web/rules.md"] },
  ] };
  const route = routeContext(router, "Fix iOS", ["ios/App.swift"]);
  assert.equal(route.selected?.score, 180);
  assert.deepEqual(route.primary, ["AGENTS.md", "ios/rules.md"]);
  assert.deepEqual(route.active, ["plan.md"]);
  assert.deepEqual(route.skills, ["apple"]);
  assert.equal(route.ready, false);
  assert.equal(routeContext(router, "websocket", []).outcome, "fallback");
});
test("hidden secondary output never hides an ambiguous required route", () => {
  const routes = ["a", "b"].map(id => ({ id, match: { prompt_terms: ["fix"] } }));
  const result = routeContext({ routes, scoring: { max_secondary_routes: 0 } }, "fix", []);
  assert.equal(result.outcome, "ambiguous");
  assert.equal(result.secondary.length, 0);
  assert.throws(() => routeContext({ routes: [routes[0], routes[0]] }, "fix", []), /Duplicate/);
});

test("routed materialization blocks missing required content and keeps optional omissions explicit", async () => {
  const { materializeRoutedContext } = await import("../src/routed-context.ts");
  const { digest } = await import("../src/core.ts");
  const files: Record<string, Buffer> = { "rules.md": Buffer.from("rule"), "extra.md": Buffer.alloc(8, "x") };
  const subject = {
    source: (path: string) => files[path] ? { file_type: "regular", identity: digest(path) } : null,
    read: (path: string) => files[path]!,
  } as unknown as import("../src/change-subject.ts").ValidationSubject;
  const route = routeContext({ routes: [{ id: "fix", match: { prompt_terms: ["fix"] }, primary_context: ["rules.md"],
    active_plan_context: ["missing.md"], expansion_context: ["extra.md"], token_budget: {
      primary_context_tokens: 1, active_plan_context_tokens: 1, expansion_context_tokens: 1, total_context_tokens: 3,
    } }] }, "fix", []);
  const packet = materializeRoutedContext(subject, route, true);
  assert.equal(packet.filesReady, false);
  assert.equal(packet.ready, false);
  assert.equal(packet.entries[0]!.content, "rule");
  assert.equal(packet.omissions.find(item => item.path === "missing.md")?.required, true);
  assert.equal(packet.omissions.find(item => item.path === "extra.md")?.required, false);
  assert.ok(packet.blockers.includes("required-context:missing.md:source-unavailable"));
  assert.ok(packet.blockers.includes("skill-catalog-not-supplied"));
});

test("context routes share pack matcher semantics for a leading recursive segment", () => {
  const router = { routes: [{ id: "nested", match: { path_globs: ["**/code.ts"] } }] };
  assert.equal(routeContext(router, "fix", ["code.ts"]).outcome, "matched");
  assert.equal(routeContext(router, "fix", ["src/code.ts"]).outcome, "matched");
});

test("path-matched owners are all required even when secondary display is hidden or scores tie", () => {
  const routes = ["source", "docs", "tools"].map(id => ({ id, match: { path_globs: [`${id}/**`] }, primary_context: [`${id}/rules.md`], skills: [id], validations: [id] }));
  const result = routeContext({ routes, scoring: { max_secondary_routes: 0 } }, "change", ["source/a.ts", "docs/plan.md", "tools/check.js"]);
  assert.equal(result.outcome, "matched");
  assert.deepEqual(new Set(result.primary), new Set(routes.map(route => route.primary_context[0])));
  assert.deepEqual(new Set(result.skills), new Set(["source", "docs", "tools"]));
  assert.equal(result.secondary.length, 0);
});

test("large path inventories cannot crowd another mandatory path owner out of routing", () => {
  const routes = ["docs", "source"].map(id => ({ id, match: { path_globs: [`${id}/**`] }, primary_context: [`${id}/rules.md`] }));
  const paths = [...Array.from({ length: 100 }, (_, i) => `docs/${i}.md`), "source/a.ts"];
  assert.equal(routeContext({ routes }, "change", paths).primary.length, 2);
});

test("mixed required context uses a stable largest envelope and still blocks real overflow", async () => {
  const { materializeRoutedContext } = await import("../src/routed-context.ts");
  const { digest } = await import("../src/core.ts");
  const routes = [2, 8].map((cap, index) => ({ id: String(index), match: { path_globs: [`part${index}/**`] },
    primary_context: [`rule${index}.md`], token_budget: { primary_context_tokens: cap,
      active_plan_context_tokens: 1, expansion_context_tokens: 1, total_context_tokens: cap } }));
  const files: Record<string, Buffer> = { "rule0.md": Buffer.from("small"), "rule1.md": Buffer.from("another rule") };
  const subject = { source: (path: string) => ({ file_type: "regular", identity: digest(path) }),
    read: (path: string) => files[path]! } as unknown as import("../src/change-subject.ts").ValidationSubject;
  const route = () => routeContext({ routes }, "fix", ["part0/a", "part1/b"]);
  assert.equal(route().budget.total_context_tokens, 8);
  assert.equal(materializeRoutedContext(subject, route(), false).filesReady, true);
  routes[0]!.id = "z"; routes[1]!.id = "a";
  assert.equal(route().budget.total_context_tokens, 8);
  assert.equal(materializeRoutedContext(subject, route(), false).filesReady, true);
  files["rule1.md"] = Buffer.alloc(100, "x");
  assert.equal(materializeRoutedContext(subject, route(), false).filesReady, false);
});
