import { test } from "node:test";
import assert from "node:assert/strict";
import { boundDecisionEvidence } from "../src/decision-excerpts.ts";
import { canonical } from "../src/core.ts";
import type { DecisionRequest } from "../src/decisions.ts";
const request: DecisionRequest = { version: 1, kind: "rank_optional_context", taskRevision: "1", purpose: "Metro workspace mismatch",
  dataClass: "source", candidates: [{ id: "a", sourceDigest: "full-a", excerpt: "Unrelated header\n".repeat(50) + "Metro workspace mismatch here\n" },
    { id: "b", sourceDigest: "full-b", excerpt: "Other details\n".repeat(50) + "Metro socket ownership\n" }] };
test("bounded excerpts retain late lexical matches, whole lines, and full source identity", () => {
  const result = boundDecisionEvidence(request, 600)!;
  assert.ok(Buffer.byteLength(canonical(result.request)) <= 600);
  assert.ok(result.request.candidates[0]!.excerpt.includes("Metro workspace mismatch here\n"));
  assert.ok(result.request.candidates[1]!.excerpt.includes("Metro socket ownership\n"));
  assert.equal(result.request.candidates[0]!.sourceDigest, "full-a");
  assert.ok(result.coverage.every(item => item.omittedBytes > 0 && item.lines.includes(51)));
  assert.equal(request.candidates[0]!.excerpt.split("\n").length, 52);
});
test("headers or indivisible lines beyond budget return no advice input", () => {
  assert.equal(boundDecisionEvidence(request, 10), null);
  const huge = { ...request, candidates: [{ id: "a", sourceDigest: "a", excerpt: "😀".repeat(1000) }] };
  assert.equal(boundDecisionEvidence(huge, 400), null);
});
