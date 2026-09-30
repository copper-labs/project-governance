import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { projectContextMetric, readContextProjection } from "../src/telemetry-projection.ts";
import { recentReceipts } from "../src/telemetry-receipt-reader.ts";
import { RELEASE_VERSION } from "../src/release-version.ts";
import { durableJson, digest } from "../src/core.ts";
import { decisionTelemetry } from "../src/decision-telemetry.ts";
import { contextObservationStatus } from "../src/context-observations.ts";
import { contextStateRoot } from "../src/context-command.ts";

test("recent matching context metrics survive unrelated newer records and report retention separately", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-metrics-")));
  try {
    const value = (index: number) => ({ id: String(index), workspace: root, capturedAt: new Date(1790730000000 + index * 1000).toISOString(), kind: "route" as const,
      entryId: null, routeId: String(index), familyId: null, taskId: null, taskRevision: null,
      status: "ready", reason: "answered", counts: { deliveredBytes: 100, httpTotalMs: 12.5, modelInputTokens: null } });
    assert.equal(readContextProjection(root, root).state, "unavailable"); assert.deepEqual(readdirSync(root), []);
    for (let index = 0; index < 1002; index++) assert.equal(projectContextMetric(root, value(index)), true);
    const path = join(root, "telemetry", readdirSync(join(root, "telemetry"))[0]!);
    const database = new DatabaseSync(path);
    try {
      for (const index of [999, 1000, 1001]) {
        const row = database.prepare("SELECT payload FROM context_metrics WHERE id=?").get(String(index))!;
        const changed = { ...JSON.parse(String(row.payload)), runtimeVersion: "older-runtime" }, payload = JSON.stringify(changed);
        database.prepare("UPDATE context_metrics SET runtime=?,payload=?,bytes=? WHERE id=?").run("older-runtime", payload, Buffer.byteLength(payload), String(index));
      }
    } finally { database.close(); }
    const before = readFileSync(path), result = readContextProjection(root, root, { runtimeVersion: RELEASE_VERSION, limit: 1 });
    assert.equal(result.state, "available"); assert.equal(result.records[0]?.id, "998"); assert.equal(result.evictedRecords, 2);
    assert.equal(result.truncated, true); assert.equal(result.writeCoverage, "not-verified");
    assert.equal(result.records[0]?.counts.modelInputTokens, null); assert.deepEqual(readFileSync(path), before, "passive status does not mutate projection storage");
    assert.equal(projectContextMetric(root, { ...value(998), prompt: "never persist user prose" } as any), false);
    assert.equal(readContextProjection(root, join(root, "absent")).state, "unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("projection hints preserve receipt-only history and a write lost to a concurrent SQLite lock", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-receipt-coverage-"))), oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    const state = contextStateRoot(root), createdAt = "2026-09-30T12:00:00Z";
    const route = (collection: string, receiptId: string) => durableJson(join(state, collection, `${receiptId}.json`), {
      version: 1, receiptId, workspace: root, createdAt, outcome: "delivered", sensitiveExtra: "receipt-only private detail",
      ...(collection === "routes" ? { optional: null } : { decision: null }),
    });
    const older = randomUUID(), projected = randomUUID(), missed = randomUUID();
    route("receipts", older); route("routes", projected);
    const metric = (id: string) => ({ id, workspace: root, capturedAt: createdAt, kind: "route" as const, entryId: null,
      routeId: id, familyId: null, taskId: null, taskRevision: null, status: "delivered", reason: null, counts: {} });
    assert.equal(projectContextMetric(state, metric(projected)), true);
    const path = join(state, "telemetry", readdirSync(join(state, "telemetry"))[0]!);
    const database = new DatabaseSync(path);
    try {
      database.exec("BEGIN IMMEDIATE");
      route("routes", missed);
      assert.equal(projectContextMetric(state, metric(missed)), false, "The immutable receipt must survive failed cache projection");
    } finally { database.exec("ROLLBACK"); database.close(); }
    const entryId = digest("historical entry").slice(7);
    durableJson(join(state, "prompt-entries", `${entryId}.json`), { version: 1, entryId, workspace: root,
      createdAt, status: "prepared", privateProse: "receipt-only private detail" });
    const observation = digest("unprojected observation").slice(7);
    durableJson(join(state, "context-observations", `${observation}.json`), { version: 1, entryId, createdAt, kind: "task-binding" });
    const before = readFileSync(path), report = decisionTelemetry(state, { workspace: root }), context = contextObservationStatus(root);
    assert.equal(report.projection.state, "available"); assert.equal(report.projection.role, "receipt-read-hints");
    assert.equal(report.counts.matched, 3); assert.equal(report.counts.invalid, 0); assert.equal(report.scanComplete, true); assert.equal(report.truncated, false);
    assert.equal(context.counts["prompt-entries:prepared"], 1); assert.equal(context.counts["routes:delivered"], 2);
    assert.equal(context.counts["context-observations:task-binding"], 1); assert.equal(context.scanComplete, true);
    assert.equal(context.latestEntry?.id, entryId); assert.equal(context.avoidedTokens, null);
    assert.equal(JSON.stringify({ report, context }).includes("receipt-only private detail"), false);
    assert.deepEqual(readFileSync(path), before, "Passive scans must not backfill or repair the cache");
  } finally {
    if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState;
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt hints share scan and byte limits, deduplicate originals and disclose a partial inventory", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-receipt-hints-")));
  try {
    const old = randomUUID(), newest = randomUUID();
    durableJson(join(root, "routes", `${old}.json`), { createdAt: "2026-09-20T12:00:00Z", content: "x".repeat(4000) });
    durableJson(join(root, "routes", `${newest}.json`), { createdAt: "2026-09-30T12:00:00Z" });
    const hint = { collection: "routes", name: `${newest}.json` };
    const bounded = recentReceipts(root, ["routes"], { limit: 1000, maximumBytes: 1000, prioritized: [hint, hint] });
    assert.equal(bounded.records[0]?.name, hint.name); assert.equal(bounded.records.length, 1);
    assert.equal(bounded.scanComplete, false); assert.equal(bounded.truncated, true); assert.ok(bounded.readBytes <= 1000);
    const complete = recentReceipts(root, ["routes"], { limit: 1000, prioritized: [hint, hint] });
    assert.equal(complete.records.length, 2); assert.equal(complete.scanned, 2); assert.equal(complete.scanComplete, true);
    assert.equal(complete.readBytes, readFileSync(join(root, "routes", `${old}.json`)).length + readFileSync(join(root, "routes", hint.name)).length);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("receipt fallback filters runtime and time before a UUID directory limit", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-receipt-order-")));
  try {
    mkdirSync(join(root, "routes"));
    const newest = { workspace: root, runtimeVersion: RELEASE_VERSION, createdAt: "2026-09-30T12:00:00Z", routeId: "newest" };
    for (let index = 0; index < 150; index++) writeFileSync(join(root, "routes", `${randomUUID()}.json`), JSON.stringify({ ...newest, runtimeVersion: "older-runtime", createdAt: "2026-09-30T13:00:00Z" }));
    for (const id of ["old", "newest"]) writeFileSync(join(root, "routes", `${randomUUID()}.json`), JSON.stringify({ ...newest, routeId: id, createdAt: id === "old" ? "2026-09-20T12:00:00Z" : newest.createdAt }));
    const result = recentReceipts(root, ["routes"], { limit: 1, since: Date.parse("2026-09-29T00:00:00Z"), predicate: value => value.runtimeVersion === RELEASE_VERSION });
    assert.equal(result.scanComplete, true); assert.equal(result.truncated, false); assert.equal(result.records[0]?.value.routeId, "newest");
    const incomplete = recentReceipts(root, ["routes"], { limit: 1, maximumBytes: 1 });
    assert.equal(incomplete.scanComplete, false); assert.equal(incomplete.truncated, true); assert.match(incomplete.selection, /partial-scan/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
