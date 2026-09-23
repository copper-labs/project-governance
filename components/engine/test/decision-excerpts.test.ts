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

test("one indivisible candidate does not suppress assessable peers", () => {
  const mixed = { ...request, candidates: [
    { id: "a", sourceDigest: "a", excerpt: "x".repeat(1500) },
    { id: "b", sourceDigest: "b", excerpt: "Metro workspace owner\n" },
  ] };
  const bounded = boundDecisionEvidence(mixed, 600)!;
  assert.deepEqual(bounded.request.candidates.map(candidate => candidate.id), ["b"]);
  assert.equal(bounded.coverage.find(item => item.id === "a")?.excerptBytes, 0);
  assert.ok(Buffer.byteLength(canonical(bounded.request)) <= 600);
});

test("discarded indivisible candidates return their classifier allowance to peers", () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `bad-${index}`, sourceDigest: `bad-${index}`, excerpt: "x".repeat(600) })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `good-${index}`, sourceDigest: `good-${index}`,
      excerpt: "Metro context\n".repeat(100) })),
  ];
  const mixed = { ...request, candidates };
  const headers = { ...mixed, candidates: candidates.map(candidate => ({ ...candidate, excerpt: "" })) };
  const firstAllowance = Math.floor((8192 - Buffer.byteLength(canonical(headers))) / candidates.length);
  const bounded = boundDecisionEvidence(mixed, 8192)!;
  assert.equal(bounded.request.candidates.length, 8);
  assert.ok(bounded.request.candidates.every(candidate => candidate.id.startsWith("good-")));
  assert.ok(bounded.coverage.filter(item => item.id.startsWith("good-")).every(item => item.excerptBytes > firstAllowance));
  assert.ok(Buffer.byteLength(canonical(bounded.request)) <= 8192);
});

test("reallocation keeps a useful first excerpt when a larger window would select only blank text", () => {
  const candidates = [
    { id: "useful", sourceDigest: "useful", excerpt: " ".repeat(280) + "\n" + "a".repeat(60) + "\n" },
    { id: "indivisible-1", sourceDigest: "one", excerpt: "x".repeat(500) },
    { id: "indivisible-2", sourceDigest: "two", excerpt: "y".repeat(500) },
  ];
  const input = { ...request, purpose: "probe", candidates };
  const headers = { ...input, candidates: candidates.map(candidate => ({ ...candidate, excerpt: "" })) };
  const maximumBytes = Buffer.byteLength(canonical(headers)) + 3 * 70;
  const bounded = boundDecisionEvidence(input, maximumBytes)!;
  assert.deepEqual(bounded.request.candidates.map(candidate => candidate.id), ["useful"]);
  assert.match(bounded.request.candidates[0]!.excerpt, /a{60}/);
  assert.deepEqual(bounded.coverage.find(item => item.id === "useful")?.lines, [2]);
  assert.ok(Buffer.byteLength(canonical(bounded.request)) <= maximumBytes);
});
