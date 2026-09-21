import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextPacket } from "../src/context-packet.ts";
import { DEFAULT_DECISIONS, JevDecisionAdapter } from "../src/decisions.ts";

const candidate = (id: string) => ({ id, sourceDigest: "sha256:fixture", excerpt: id.repeat(30) });
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
        token: "fixture", fetch: async () => new Response(JSON.stringify({ model: DEFAULT_DECISIONS.model,
          answers: { suggestion: { type: "choice", choice: "b", confidence: 0.9,
            probabilities: { a: 0.05, b: 0.9, abstain: 0.05 } } }, usage: { input_tokens: 100, output_tokens: 10 } })),
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
