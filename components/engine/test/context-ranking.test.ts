import { test } from "node:test";
import assert from "node:assert/strict";
import { lexicalContextOrder } from "../src/context-ranking.ts";
import type { DecisionRequest } from "../src/decisions.ts";
test("lexical baseline uses evidence without gold labels and preserves equal-score discovery order", () => {
  const request: DecisionRequest = { version: 1, kind: "rank_optional_context", taskRevision: "1", purpose: "Metro workspace mismatch", dataClass: "source",
    candidates: [{ id: "styles", sourceDigest: "a", excerpt: "color and font" }, { id: "owner", sourceDigest: "b", excerpt: "Metro workspace mismatch" },
      { id: "layout", sourceDigest: "c", excerpt: "padding and margins" }] };
  assert.deepEqual(lexicalContextOrder(request), ["owner", "styles", "layout"]);
  assert.deepEqual(lexicalContextOrder({ ...request, purpose: "unmatched" }), ["styles", "owner", "layout"]);
});
