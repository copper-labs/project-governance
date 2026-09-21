import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { durableJson, fileDigest } from "../src/core.ts";
import { decisionTelemetry } from "../src/decision-telemetry.ts";

test("offline outcomes join caller links, retain disagreeing labels, deduplicate and refuse changed evidence", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-outcomes-")));
  try {
    const id = "a".repeat(32), other = "b".repeat(32);
    const add = (key: string) => durableJson(join(root, "decisions", `${key}.json`), { version: 2, receiptId: key, outcome: {
      version: 2, scope: { workspace: root, taskId: "task", taskRevision: "1" }, consumers: ["DL05"], mode: "auto", delivered: true, reason: "answered" } });
    add(id); add(other);
    const callerPath = join(root, "caller.json"), nativePath = join(root, "native.json");
    durableJson(callerPath, { deviceAdvice: { decision: { receiptId: id } }, privateText: "never-export" });
    durableJson(nativePath, { version: 1, requestDigest: `sha256:${"1".repeat(64)}`, state: "failed", cleanup: "unknown", log: "never-export" });
    const entry = { id: "episode-1", decisions: [id, id, other], caller: { path: callerPath, digest: fileDigest(callerPath) },
      native: [{ kind: "command", path: nativePath, digest: fileDigest(nativePath) }],
      labels: [{ reviewer: "reviewer-a", disposition: "accepted", at: "2026-09-21T12:00:00Z" }, { reviewer: "reviewer-b", disposition: "reopened", at: "2026-09-21T13:00:00Z" }], observations: { interventions: 0 } };
    const manifest = join(root, "outcomes.json"); durableJson(manifest, { version: 1, episodes: [entry, entry] });
    const report = decisionTelemetry(root, { outcomesManifest: manifest }).outcome_report!;
    assert.equal(report.counts.joined, 1); assert.equal(report.counts.duplicate_episodes, 1);
    assert.equal(report.counts.duplicate_decisions, 1); assert.equal(report.counts.missing_decisions, 1);
    assert.deepEqual(report.labels, { accepted: 1, reopened: 1 });
    const sample = report.samples[0] as any;
    assert.equal(sample.native[0].cleanup, "unknown"); assert.equal(sample.observations.interventions, 0);
    assert.equal(sample.observations.llmInputTokens, null); assert.equal(report.avoided_llm_tokens, null);
    assert.equal(JSON.stringify(report).includes("never-export"), false);
    durableJson(nativePath, { version: 1, state: "succeeded" });
    const changed = decisionTelemetry(root, { outcomesManifest: manifest }).outcome_report!;
    assert.equal(changed.counts.joined, 0); assert.equal(changed.counts.invalid, 1);
    assert.equal(decisionTelemetry(root).outcome_report, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("unscoped fallback receipts retain episode labels and every selected episode is accounted for", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-outcomes-unscoped-")));
  try {
    const id = "c".repeat(32), scoped = "d".repeat(32), absent = "e".repeat(32);
    for (const key of [id, scoped]) durableJson(join(root, "decisions", `${key}.json`), { version: 2, receiptId: key,
      outcome: { version: 2, scope: key === id ? null : { workspace: root, taskId: "task", taskRevision: "1" },
        consumers: ["DL09"], delivered: false, reason: key === id ? "scope-unavailable" : "missing-token", mode: "auto" } });
    const caller = join(root, "caller.json");
    // Caller artifacts have object roots, matching the public command envelope.
    durableJson(caller, { advice: [{ receiptId: id }, { receiptId: scoped }] });
    const entry = { id: "mixed", decisions: [id, scoped], caller: { path: caller, digest: fileDigest(caller) },
      labels: [{ reviewer: "operator", disposition: "uncertain", at: "2026-09-21T00:00:00Z" }] };
    const manifest = join(root, "manifest.json");
    durableJson(manifest, { version: 1, episodes: [entry, { ...entry, id: "missing", decisions: [absent] }, entry] });
    const report = decisionTelemetry(root, { outcomesManifest: manifest }).outcome_report!;
    assert.equal(report.counts.unscoped_decisions, 1);
    assert.equal(report.counts.joined, 1); assert.equal(report.counts.invalid, 0);
    assert.equal(report.counts.no_linked_decisions, 1); assert.equal(report.counts.missing_native, 1);
    assert.equal(report.labels.uncertain, 1);
    const c = report.counts;
    assert.equal(c.joined + c.invalid + c.duplicate_episodes + c.no_linked_decisions, c.selected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("version two includes off and failed episodes, detects missing capture and deduplicates native costs", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-outcomes-v2-")));
  try {
    const scope = { workspace: root, taskId: "task", taskRevision: "1" };
    const hash = `sha256:${"1".repeat(64)}`;
    const nativePath = join(root, "native.json");
    durableJson(nativePath, { version: 1, requestDigest: hash, state: "cancelled", cleanup: "confirmed", scope, durationMs: 25 });
    const entries = ["one", "two"].map(id => {
      const path = join(root, `${id}.json`);
      durableJson(path, { version: 1, id, scope, native: { runId: "run", runDigest: hash, stagesDigest: hash, eventsDigest: hash },
        exposure: { mode: "off", delivered: false }, decisions: [] });
      return { id, scope, decisions: [], caller: { path, digest: fileDigest(path) }, native: [{ kind: "command", path: nativePath, digest: fileDigest(nativePath) }] };
    });
    const manifest = join(root, "manifest.json");
    durableJson(manifest, { version: 2, episodes: [...entries, { ...entries[0], id: "missing", caller: { path: join(root, "missing.json"), digest: hash } }] });
    const report = decisionTelemetry(root, { outcomesManifest: manifest }).outcome_report!;
    assert.equal(report.counts.selected, 3); assert.equal(report.counts.joined, 2);
    assert.equal(report.counts.invalid, 1); assert.equal(report.counts.missing_captures, 1);
    assert.equal((report as any).native_cost.knownSummedDurationMs, 25);
    assert.equal(report.counts.duplicate_native, 1); assert.equal(report.counts.no_linked_decisions, 0);
    assert.equal((report.samples[0] as any).native[0].state, "cancelled");
    assert.equal((report.samples[1] as any).native[0].duplicateCost, true);
    assert.equal((report.samples[0] as any).observations.llmInputTokens, null);
    durableJson(manifest, { version: 2, episodes: [{ ...entries[0], scope: { ...scope, taskRevision: "2" } }] });
    assert.equal(decisionTelemetry(root, { outcomesManifest: manifest }).outcome_report!.counts.invalid, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
