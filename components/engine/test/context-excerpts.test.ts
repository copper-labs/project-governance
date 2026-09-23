import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contextExcerpt } from "../src/context-excerpts.ts";
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
