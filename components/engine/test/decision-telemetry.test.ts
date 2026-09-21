import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { durableJson } from "../src/core.ts";
import { decisionTelemetry } from "../src/decision-telemetry.ts";

test("decision report measures fallback, stale outcomes and partial native token coverage without exposing receipt content", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-telemetry-")));
  try {
    const add = (collection: string, decision: unknown, outcome = "delivered") => {
      const receiptId = randomUUID();
      durableJson(join(root, collection, `${receiptId}.json`), { version: 1, receiptId, createdAt: "2026-09-20T12:00:00Z", outcome,
        sensitiveExtra: "must-not-appear-in-report", ...(collection === "routes" ? { optional: decision === null ? null : { decision } } : { decision }) });
    };
    const baseline = { version: 1, kind: "rank_optional_context", method: "baseline", reason: "missing-token", latencyMs: 1,
      usage: { inputTokens: null, outputTokens: null } };
    add("receipts", baseline);
    add("routes", { ...baseline, method: "jev", baselineVersion: "lexical-context-1", reason: "selected", latencyMs: 100, usage: { inputTokens: 42, outputTokens: 3 } }, "refused-stale-source");
    add("routes", null, "blocked");
    add("evaluations", baseline); // Private frozen evaluation cases do not enter operational totals.
    const result = decisionTelemetry(root);
    assert.deepEqual(result.counts, { inspected: 3, matched: 3, invalid: 0, without_decision: 1, delivered: 1, blocked: 1, stale: 1, jev_selected: 1, baseline_selected: 1 });
    assert.deepEqual(result.tokens, { decision_samples: 2, input_samples: 1, output_samples: 1, input_total: 42, output_total: 3 });
    assert.deepEqual(result.baselines, { lexical_context_1: 1, discovery_order_1: 0, unspecified: 1, unrecognized: 0 });
    assert.equal(result.latency_ms.p95, 100); assert.equal(result.avoided_llm_tokens, null);
    assert.equal(JSON.stringify(result).includes("must-not-appear"), false);
    assert.equal(decisionTelemetry(root, { limit: 1 }).truncated, true);
    assert.equal(decisionTelemetry(root, { since: "2026-09-21" }).counts.matched, 0);
    assert.throws(() => decisionTelemetry(root, { since: "invalid" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("decision reporting counts malformed and symlinked receipts without following them", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-telemetry-invalid-")));
  try {
    mkdirSync(join(root, "receipts"));
    const id = randomUUID();
    durableJson(join(root, "foreign.json"), { private: true });
    symlinkSync("../foreign.json", join(root, "receipts", `${id}.json`));
    const malformed = randomUUID(); durableJson(join(root, "receipts", `${malformed}.json`), { receiptId: "wrong" });
    assert.equal(decisionTelemetry(root).counts.invalid, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
