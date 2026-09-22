import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { durableJson } from "../src/core.ts";
import { decisionTelemetry } from "../src/decision-telemetry.ts";

test("exposure reports select newest captures with stable ties and disclose bounded sampling", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "exposure-order-")));
  try {
    const add = (id: string, capturedAt: string, reason: string) => durableJson(join(root, "episodes", `${id}.json`),
      { version: 1, id, capturedAt, entryKind: "check-plan", exposure: { reason }, scope: { taskId: "private-task" } });
    add("a-old", "2026-09-21T00:00:00Z", "old");
    add("z-new", "2026-09-22T00:00:00Z", "recent-second");
    add("b-new", "2026-09-22T00:00:00Z", "recent-first");
    symlinkSync("../foreign.json", join(root, "episodes", "foreign.json"));
    const report = decisionTelemetry(root, { limit: 1 }).exposure;
    assert.deepEqual({ ...report.reasons }, { "recent-first": 1 });
    assert.equal(report.counts.observed, 1); assert.equal(report.counts.inspected, 4); assert.equal(report.counts.invalid, 1);
    assert.equal(report.truncated, true); assert.equal(report.scanComplete, true); assert.match(report.selection, /newest-capture-first/);
    assert.equal(JSON.stringify(report).includes("private-task"), false);
    assert.equal(decisionTelemetry(root, { since: "2026-09-22" }).exposure.counts.observed, 2);
    add("long-reason", "2026-09-22T00:00:00Z", "x".repeat(200000));
    durableJson(join(root, "episodes", "bad-key.json"), { version: 1, id: "bad-key", capturedAt: "2026-09-22T00:00:00Z", entryKind: "__proto__", exposure: {} });
    add("prototype-name", "2026-09-22T00:00:00Z", "constructor");
    const invalid = decisionTelemetry(root).exposure;
    assert.equal(invalid.counts.invalid, 3); assert.equal(invalid.reasons.constructor, 1);
    assert.equal(Object.values(invalid.entries).reduce((sum, count) => sum + count, 0), invalid.counts.observed);
    assert.ok(JSON.stringify(invalid).length < 2000);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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

test("expanded report counts a shared batch once and keeps missing usage unknown", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-pilot-report-")));
  try {
    const add = (id: string, reservation: string | null, usage: { inputTokens: number | null; outputTokens: number | null }) => {
      durableJson(join(root, "decisions", `${id}.json`), { version: 2, receiptId: id, createdAt: "2026-09-21T12:00:00Z", outcome: {
        version: 2, consumers: ["DL01", "DL02"], usageAllocation: { DL01: 3, DL02: 2 }, delivered: true, reason: "answered",
        budget: { reservationId: reservation }, usage, scope: { taskId: "private-task" },
      } });
    };
    add("a".repeat(32), "1".repeat(32), { inputTokens: 100, outputTokens: 10 });
    add("b".repeat(32), "1".repeat(32), { inputTokens: 100, outputTokens: 10 });
    add("c".repeat(32), "2".repeat(32), { inputTokens: null, outputTokens: null });
    const report = decisionTelemetry(root).pilot;
    assert.equal(report.counts.matched, 2);
    assert.equal(report.counts.duplicate_reservations, 1);
    assert.equal(report.tokens.input_total, 100);
    assert.equal(report.tokens.input_samples, 1);
    assert.deepEqual(report.consumers.DL01, { observations: 2, delivered: 2, questions: 6 });
    assert.equal(report.avoided_llm_tokens, null);
    assert.equal(JSON.stringify(report).includes("private-task"), false);
    assert.equal(decisionTelemetry(root, { since: "2026-09-22" }).pilot.counts.matched, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("legacy caller projections do not recount a reused shared decision", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "legacy-usage-")));
  try {
    const decision = { version: 1, receiptId: "a".repeat(32), kind: "rank_optional_context", method: "jev", reason: "selected", latencyMs: 1,
      usage: { inputTokens: 42, outputTokens: 3 } };
    for (const collection of ["receipts", "routes"]) {
      const receiptId = randomUUID();
      durableJson(join(root, collection, `${receiptId}.json`), { version: 1, receiptId, createdAt: "2026-09-21T00:00:00Z", outcome: "delivered",
        ...(collection === "routes" ? { optional: { decision } } : { decision }) });
    }
    const report = decisionTelemetry(root);
    assert.equal(report.counts.matched, 2);
    assert.equal(report.tokens.input_total, 42); assert.equal(report.tokens.output_total, 3);
    assert.equal(report.tokens.input_samples, 1);
    assert.equal(report.usage_accounting.repeated_observations, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("explicitly missing shared receipt identity never fabricates unique token usage", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "unidentified-usage-")));
  try {
    for (let index = 0; index < 2; index++) {
      const receiptId = randomUUID();
      durableJson(join(root, "receipts", `${receiptId}.json`), { version: 1, receiptId, createdAt: "2026-09-21T00:00:00Z", outcome: "delivered",
        decision: { version: 1, receiptId: null, kind: "rank_optional_context", method: "jev", reason: "selected", latencyMs: 1,
          usage: { inputTokens: 42, outputTokens: 3 } } });
    }
    const report = decisionTelemetry(root);
    assert.equal(report.counts.matched, 2); assert.equal(report.tokens.input_total, null);
    assert.equal(report.usage_accounting.unidentified_usage_observations, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
