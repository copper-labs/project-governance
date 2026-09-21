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

test("context routes retain fnmatch semantics for a leading recursive segment", () => {
  const router = { routes: [{ id: "nested", match: { path_globs: ["**/code.ts"] } }] };
  assert.equal(routeContext(router, "fix", ["code.ts"]).outcome, "fallback");
  assert.equal(routeContext(router, "fix", ["src/code.ts"]).outcome, "matched");
});
