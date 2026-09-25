import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextPacket } from "../src/context-packet.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { DEFAULT_DECISIONS, JevDecisionAdapter } from "../src/decisions.ts";

const candidate = (id: string) => ({ id, sourceDigest: "sha256:fixture", excerpt: id.repeat(30) });
test("unmatched declaration names do not displace a relevant body window", () => {
  const input = { id: "source", sourceDigest: "fixture", excerpt: "function first() {}\n" + "unrelated line\n".repeat(80) + "renew expired session\n" + "unrelated line\n".repeat(80) };
  const excerpt = contextExcerpt(input, "renew expired session", 128, [{ name: "first", start: 1, end: 1 }]);
  assert.match(excerpt.excerpt, /renew expired session/); assert.ok(excerpt.sourceRange!.firstLine > 1);
});
test("baseline ranks full captured meaning independently of delivery excerpt limits", async () => {
  const input = { taskRevision: "whole-source", purpose: "alpha bravo charlie", required: [], maximumBytes: 4000,
    optional: [{ id: "a", sourceDigest: "first", excerpt: "alpha bravo\n" },
      { id: "b", sourceDigest: "second", excerpt: ["alpha\n", "unrelated\n".repeat(500), "bravo\n", "unrelated\n".repeat(500), "charlie\n"].join("") }] };
  const provider = { async decide(): Promise<never> { throw new Error("offline"); } };
  for (const optionalExcerptBytes of [128, 2048]) {
    const packet = await buildContextPacket({ ...input, optionalExcerptBytes }, provider);
    assert.deepEqual(packet.entries.map(entry => entry.id), ["b", "a"]);
    assert.equal(packet.entries[0]!.sourceRange?.complete, false);
  }
});
test("provider-free context preserves required evidence and bounds optional reading", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-packet-"));
  try {
    const provider = new JevDecisionAdapter(DEFAULT_DECISIONS, join(directory, "health"), {
      fetch: async () => { throw new Error("network must not run"); },
    });
    const packet = await buildContextPacket({ taskRevision: "1", purpose: "find bug", required: [candidate("rules")],
      optional: [candidate("a"), candidate("b")], maximumBytes: 350 }, provider);
    assert.deepEqual(packet.entries.map(entry => entry.id), ["rules", "a"]);
    assert.deepEqual(packet.omitted, ["b"]);
    assert.equal(packet.reason, "off");
    assert.equal(packet.measurement.tokenSavings, null);
    assert.ok(packet.bytes <= 350);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("an oversized single line cannot bypass the optional excerpt limit", async () => {
  const packet = await buildContextPacket({ taskRevision: "single-line", purpose: "find the contract",
    required: [{ id: "rules", sourceDigest: "required", excerpt: "Required rules" }],
    optional: [{ id: "minified", sourceDigest: "large", excerpt: "x".repeat(3000) },
      { id: "oversized-blank", sourceDigest: "blank-large", excerpt: " ".repeat(3000) },
      { id: "contract", sourceDigest: "small", excerpt: "The relevant contract\n" }],
    maximumBytes: 5000, optionalExcerptBytes: 2048 },
  { async decide(): Promise<never> { throw new Error("offline"); } });
  assert.deepEqual(packet.entries.map(entry => entry.id), ["rules", "contract"]);
  assert.deepEqual(packet.omitted, ["minified", "oversized-blank"]);
  assert.equal(packet.omissionReasons.minified, "excerpt-unrepresentable");
  assert.equal(packet.omissionReasons["oversized-blank"], "excerpt-unrepresentable");
  assert.ok(packet.bytes <= 5000);
});
test("a nonblank source with no informative whole-line excerpt is omitted", async () => {
  const packet = await buildContextPacket({ taskRevision: "hidden-content", purpose: "find bug",
    required: [], maximumBytes: 5000, optionalExcerptBytes: 2048,
    optional: [{ id: "hidden", sourceDigest: "full", excerpt: "\n".repeat(2100) + "x".repeat(3000) }] },
  { async decide(): Promise<never> { throw new Error("No assessable evidence"); } });
  assert.deepEqual(packet.entries, []);
  assert.deepEqual(packet.omitted, ["hidden"]);
  assert.equal(packet.omissionReasons.hidden, "excerpt-unrepresentable");
});
test("undeliverable and blank sources do not suppress legacy advice for useful evidence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-packet-legacy-"));
  let calls = 0;
  try {
    const provider = new JevDecisionAdapter({ ...DEFAULT_DECISIONS, mode: "auto",
      allowedQuestions: ["rank_optional_context"], allowedDataClasses: ["source"],
      allowedSourcePaths: ["single-line", "blank", "good"] }, join(directory, "health"), {
      scope: { workspace: directory, taskId: "task", taskRevision: "1" }, token: "fixture",
      fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ model: DEFAULT_DECISIONS.model,
          answers: { suggestion: { type: "choice", choice: "good", confidence: 0.9,
            probabilities: { good: 0.9, unknown: 0.1 } } },
          usage: { input_tokens: 20, output_tokens: 2 } }));
      },
    });
    const packet = await buildContextPacket({ taskRevision: "1", purpose: "find useful source",
      required: [], maximumBytes: 5000, optionalExcerptBytes: 2048,
      optional: [{ id: "single-line", sourceDigest: "long", excerpt: "x".repeat(3000) },
        { id: "blank", sourceDigest: "blank", excerpt: "  \n" },
        { id: "good", sourceDigest: "good", excerpt: "Useful source for the task\n" }] }, provider);
    assert.equal(calls, 1);
    assert.equal(packet.decision?.method, "jev");
    assert.deepEqual(packet.entries.map(entry => entry.id), ["good", "blank"]);
    assert.deepEqual(packet.omitted, ["single-line"]);
    assert.equal(packet.omissionReasons["single-line"], "excerpt-unrepresentable");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("provider failure retains baseline and required context cannot be truncated", async () => {
  const provider = { decide: async (): Promise<never> => { throw new Error("unavailable"); } };
  const input = { taskRevision: "1", purpose: "find bug", required: [candidate("rules")], optional: [candidate("a")], maximumBytes: 1000 };
  const packet = await buildContextPacket(input, provider);
  assert.deepEqual(packet.entries.map(entry => entry.id), ["rules", "a"]);
  await assert.rejects(buildContextPacket({ ...input, maximumBytes: 1 }, provider), /required context/);
});

test("auto advice changes optional selection while shadow preserves baseline delivery", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-ranking-"));
  try {
    for (const mode of ["auto", "shadow"] as const) {
      const provider = new JevDecisionAdapter({ ...DEFAULT_DECISIONS, mode,
        allowedQuestions: ["rank_optional_context"], allowedDataClasses: ["source"], allowedSourcePaths: ["a", "b"] }, join(directory, mode), {
        scope: { workspace: directory, taskId: mode, taskRevision: "1" }, token: "fixture", fetch: async () => new Response(JSON.stringify({ model: DEFAULT_DECISIONS.model,
          answers: { suggestion: { type: "choice", choice: "b", confidence: 0.9,
            probabilities: { a: 0.05, b: 0.9, unknown: 0.05 } } }, usage: { input_tokens: 100, output_tokens: 10 } })),
      });
      const packet = await buildContextPacket({ taskRevision: "1", purpose: "find bug", required: [candidate("rules")],
        optional: [candidate("a"), candidate("b")], maximumBytes: 350 }, provider);
      assert.deepEqual(packet.entries.map(entry => entry.id), ["rules", mode === "auto" ? "b" : "a"]);
      assert.deepEqual(packet.decision?.suggested, ["b", "a"]);
      assert.equal(packet.decision?.usage.inputTokens, 100);
      assert.equal(packet.measurement.benefit, "not-evaluated");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("stale identity, omitted IDs, and invented IDs cannot alter packet selection", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-invalid-"));
  try {
    const baseline = new JevDecisionAdapter(DEFAULT_DECISIONS, join(directory, "health"));
    for (const mutation of ["stale", "omitted", "invented"]) {
      const provider = { decide: async (request: Parameters<typeof baseline.decide>[0]) => {
        const result = await baseline.decide(request);
        if (mutation === "stale") result.inputDigest = "old-task";
        if (mutation === "omitted") result.delivered = ["b"];
        if (mutation === "invented") result.delivered = ["injected", "b"];
        return result;
      } };
      const packet = await buildContextPacket({ taskRevision: "1", purpose: "find bug", required: [candidate("rules")],
        optional: [candidate("a"), candidate("b")], maximumBytes: 350 }, provider);
      assert.deepEqual(packet.entries.map(entry => entry.id), ["rules", "a"]);
      assert.equal(packet.decision, null);
      assert.equal(packet.reason, "provider-unavailable");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("disabled assistance, provider exceptions and invalid advice share one lexical fallback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-fallback-parity-"));
  try {
    const offline = new JevDecisionAdapter(DEFAULT_DECISIONS, join(directory, "health"), { token: "" });
    const input = { taskRevision: "fallback-parity", purpose: "recover interrupted maintenance", required: [], maximumBytes: 110,
      optional: [{ id: "styles", sourceDigest: "first", excerpt: "visual typography" },
        { id: "runtime", sourceDigest: "second", excerpt: "recover interrupted maintenance" }] };
    const expected = await buildContextPacket(input, offline);
    assert.deepEqual(expected.entries.map(entry => entry.id), ["runtime"]);
    for (const provider of [
      { async decide(): Promise<never> { throw new Error("transport unavailable"); } },
      { async decide(request: Parameters<typeof offline.decide>[0]) { return { ...await offline.decide(request), inputDigest: "stale" }; } },
    ]) {
      const packet = await buildContextPacket(input, provider);
      assert.deepEqual(packet.entries, expected.entries);
      assert.deepEqual(packet.omitted, expected.omitted);
      assert.equal(packet.reason, "provider-unavailable");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
