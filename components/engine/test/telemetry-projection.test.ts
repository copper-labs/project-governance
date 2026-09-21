import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, realpathSync, rmSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { RunMetric } from "../src/check-telemetry.ts";
import { projectRunMetric, readRunProjection } from "../src/telemetry-projection.ts";
const metric = (workspace: string, index = 0): RunMetric => ({ version: 1, run_id: randomUUID(), workspace, stage: "pre-commit", runtime_version: "3.0.0-preview.1",
  status: "passed", termination_reason: "completed", duration_ms: 100, started_at: new Date(1789896000000 + index * 1000).toISOString(),
  ended_at: new Date(1789896000100 + index * 1000).toISOString(), pack_count: 1, command_count: 1, blocked_pack_count: 0, result_digest: "sha256:" + "a".repeat(64) });

test("rolling projection deduplicates retained identities, bounds history and leaves operational proof intact", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "projection-retention-")));
  try {
    writeFileSync(join(root, "operational-proof.json"), "retained critical proof");
    const first = metric(root);
    assert.equal(projectRunMetric(root, first), true);
    assert.equal(projectRunMetric(root, first), true);
    assert.equal(readRunProjection(root, root).metrics.length, 1);
    assert.equal(projectRunMetric(root, { ...first, duration_ms: 200 }), false);
    for (let index = 1; index <= 1000; index++) assert.equal(projectRunMetric(root, metric(root, index)), true);
    const result = readRunProjection(root, root);
    assert.equal(result.metrics.length, 1000); assert.equal(result.evicted_records, 1);
    assert.ok(result.retained_bytes! <= result.limits.bytes);
    assert.equal(result.metrics.some(value => value.run_id === first.run_id), false);
    assert.equal(readFileSync(join(root, "operational-proof.json"), "utf8"), "retained critical proof");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("projection rejects extra content and isolates locked or unsupported storage", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "projection-failure-")));
  try {
    assert.equal(readRunProjection(root, root).state, "unavailable");
    const value = metric(root);
    assert.equal(projectRunMetric(root, { ...value, prompt: "must not persist" } as RunMetric), false);
    assert.equal(projectRunMetric(root, value), true);
    const path = join(root, "telemetry", readdirSync(join(root, "telemetry"))[0]!);
    const locked = new DatabaseSync(path);
    try {
      locked.exec("BEGIN IMMEDIATE");
      assert.equal(projectRunMetric(root, metric(root)), false);
      locked.exec("ROLLBACK");
      assert.equal(readRunProjection(root, root).metrics.length, 1);
      locked.exec("PRAGMA user_version=99");
      assert.equal(projectRunMetric(root, metric(root)), false);
      assert.equal(readRunProjection(root, root).state, "unavailable");
    } finally { locked.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("projection readback rejects indexed identity drift rather than reporting unrelated metrics", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "projection-identity-")));
  try {
    assert.equal(projectRunMetric(root, metric(root)), true);
    const path = join(root, "telemetry", readdirSync(join(root, "telemetry"))[0]!);
    const database = new DatabaseSync(path);
    try { database.prepare("UPDATE metrics SET id=?").run(randomUUID()); } finally { database.close(); }
    assert.equal(readRunProjection(root, root).state, "unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
