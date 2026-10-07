import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contextExcerpt, contextSpanChoices } from "../src/context-excerpts.ts";
import { extractSourceFacts } from "../src/context-source-facts.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { digest } from "../src/core.ts";

test("optional excerpts preserve contiguous source lines, full source identity and exact UTF-8 digest", () => {
  const lines = [...Array(50).fill("unrelated setup\n"), "maintenance rollback recovery boundary 雪\n", ...Array(50).fill("unrelated tail\n")];
  const source = { id: "source.ts", sourceDigest: "whole-file", excerpt: lines.join("") };
  const result = contextExcerpt(source, "maintenance rollback recovery", 160);
  assert.equal(result.sourceDigest, source.sourceDigest);
  assert.ok(result.sourceRange);
  assert.equal(result.excerpt, lines.slice(result.sourceRange.firstLine - 1, result.sourceRange.lastLine).join(""));
  assert.ok(result.excerpt.includes("maintenance rollback recovery"));
  assert.ok(Buffer.byteLength(result.excerpt) <= 160);
  assert.equal(result.sourceRange.excerptDigest, `sha256:${createHash("sha256").update(result.excerpt).digest("hex")}`);
  assert.equal(result.sourceRange.complete, false);
  assert.deepEqual(contextExcerpt(source, "maintenance rollback recovery", 160), result);
  assert.equal(contextExcerpt({ ...source, excerpt: "雪".repeat(100) }, "snow", 128).sourceRange, undefined);
});

test("explicit excerpt delivery fits oversized optional context without truncating required instructions", async () => {
  const required = { id: "rules", sourceDigest: "required", excerpt: "Keep all mandatory instructions." };
  const source = { id: "source.ts", sourceDigest: "whole", excerpt: "unrelated\n".repeat(100) + "find recovery here\n" + "unrelated\n".repeat(100) };
  const provider = { async decide(request: import("../src/decisions.ts").DecisionRequest) {
    return { version: 1 as const, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(c => c.id), suggested: null,
      method: "baseline" as const, reason: "off", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
  } };
  const input = { taskRevision: "1", purpose: "find recovery", required: [required], optional: [source], maximumBytes: 700 };
  assert.deepEqual((await buildContextPacket(input, provider)).omitted, [source.id]);
  const packet = await buildContextPacket({ ...input, optionalExcerptBytes: 160 }, provider);
  assert.deepEqual(packet.entries[0], required);
  assert.equal(packet.entries[1]?.id, source.id);
  assert.equal(packet.measurement.excerpts.length, 1);
  assert.ok(packet.bytes <= input.maximumBytes);
  await assert.rejects(buildContextPacket({ ...input, optional: [], optionalExcerptBytes: 0 }, provider), /excerpt budget/);
});

test("excerpt windows favor actual source content over leading whitespace", () => {
  const source = { id: "notes.md", sourceDigest: "whole", excerpt: "\n".repeat(2100) + "The retry budget is 30 seconds.\n" };
  const excerpt = contextExcerpt(source, "find bug", 2048);
  assert.ok(excerpt.excerpt.includes("The retry budget is 30 seconds."));
  assert.ok(excerpt.excerpt.trim());
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= 2048);
});

// Frozen separately from the existing quality labels: a weak ownership row competes with two complete rules.
const tableFallbackRegression = Object.freeze({
  path: "docs/fallback.md", purpose: "Inspect lease release cleanup and approval safeguard", maximumBytes: 512,
  source: "# Ownership\n| Area | Steward |\n| --- | --- |\n| Release | platform |\n" +
    "Background ownership note.\n".repeat(30) +
    "# Lease release cleanup\nThe verified owner clears the lease and completes cleanup after release.\n" +
    "# Approval safeguard\nApproval stays required before changing the protected safeguard.\n" +
    "# Other notes\n" + "Unrelated presentation detail.\n".repeat(30),
  expectedSections: Object.freeze(["Lease release cleanup", "Approval safeguard"]),
});

test("a weak table match cannot replace stronger complete and complementary fallback sections", () => {
  const fixture = tableFallbackRegression, facts = extractSourceFacts(fixture.path, Buffer.from(fixture.source));
  const candidate = { id: fixture.path, sourceDigest: facts.digest, excerpt: fixture.source };
  const choices = contextSpanChoices(candidate, fixture.purpose, facts.spans);
  assert.equal(choices[0]!.span.name, fixture.expectedSections[0]);
  assert.equal(choices[1]!.span.name, fixture.expectedSections[1]);
  const row = choices.find(item => item.span.kind === "table-row")!;
  assert.ok(row.score > 0 && row.score < choices[1]!.score, "The row matches the request, but ranks below both complete rules");
  const excerpt = contextExcerpt(candidate, fixture.purpose, fixture.maximumBytes, facts.spans);
  assert.deepEqual(excerpt.sourceUnits?.map(item => item.name), fixture.expectedSections);
  assert.ok(excerpt.sourceUnits?.every(item => item.complete && item.kind === "heading"));
  assert.match(excerpt.excerpt, /The verified owner clears/);
  assert.match(excerpt.excerpt, /Approval stays required/);
  assert.equal(excerpt.excerpt.includes("| Release | platform |"), false);
  assert.equal(excerpt.sourceRanges?.length, 2);
  const lines = fixture.source.match(/[^\n]*\n|[^\n]+$/gu)!;
  for (const range of excerpt.sourceRanges!) {
    const original = lines.slice(range.firstLine - 1, range.lastLine).join("");
    assert.equal(range.excerptDigest, `sha256:${createHash("sha256").update(original).digest("hex")}`);
    assert.ok(excerpt.excerpt.includes(original));
  }
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= fixture.maximumBytes);
});

test("the strongest table fallback still delivers its exact columns and distant row atomically", () => {
  const source = "# Inventory\n| Source | Stored unit |\n| --- | --- |\n" +
    Array.from({ length: 30 }, (_, index) => `| Sensor ${index} | routine value |\n`).join("") +
    "| Radio stream | milliseconds |\n# Side notes\nThe milliseconds guide contains presentation details.\n";
  const facts = extractSourceFacts("docs/inventory.md", Buffer.from(source));
  const candidate = { id: "docs/inventory.md", sourceDigest: facts.digest, excerpt: source }, purpose = "Find radio stream milliseconds";
  const strongest = contextSpanChoices(candidate, purpose, facts.spans)[0]!;
  assert.equal(strongest.span.kind, "table-row"); assert.equal(strongest.span.start, 34);
  const excerpt = contextExcerpt(candidate, purpose, 256, facts.spans);
  assert.deepEqual(excerpt.sourceUnits?.map(item => [item.kind, item.complete]), [["table-columns", true], ["table-row", true]]);
  assert.deepEqual(excerpt.sourceRanges?.map(item => [item.firstLine, item.lastLine]), [[2, 3], [34, 34]]);
  assert.match(excerpt.excerpt, /\| Source \| Stored unit \|/);
  assert.match(excerpt.excerpt, /\| Radio stream \| milliseconds \|/);
  assert.equal(excerpt.excerpt.includes("Sensor 0"), false);
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= 256);
});
