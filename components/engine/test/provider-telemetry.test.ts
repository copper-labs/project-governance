import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson, fileDigest } from "../src/core.ts";
import { providerTelemetry } from "../src/provider-telemetry.ts";

test("provider telemetry binds receipts, preserves native accounting and never scans private logs", () => {
  const root = mkdtempSync(join(tmpdir(), "provider-metrics-"));
  try {
    const jobs = ["claude", "codex", "gemini"].map(provider => {
      const directory = join(root, provider), request = { version: 1, provider: { kind: provider, model: "selected-model" }, prompt: "private-canary" }, requestDigest = digest(request);
      durableJson(join(directory, "request.json"), request);
      const providerResult = join(directory, "provider-result.json");
      const usage = provider === "claude" ? { usage: { input_tokens: 100, output_tokens: 20 }, estimated_cost_usd: 0.01, models: { "selected-model": { inputTokens: 90, outputTokens: 18 }, "utility-model": { inputTokens: 10, outputTokens: 2, costUSD: 0.001 } }, secret: "private-canary" }
        : provider === "codex" ? { last: { inputTokens: 30 }, total: { inputTokens: 300 } } : null;
      durableJson(providerResult, { version: 1, requestDigest, usage, completion: { answer: "private-canary" } });
      durableJson(join(directory, "result.json"), { version: 1, requestDigest, state: "succeeded", cleanup: "confirmed", durationMs: 100,
        providerResult, providerResultDigest: fileDigest(providerResult) });
      return { directory, requestDigest };
    });
    const report = providerTelemetry([...jobs, jobs[0]!]);
    assert.equal(report.counts.matched, 3); assert.equal(report.counts.duplicates, 1);
    assert.deepEqual(report.samples[0]!.reportedUsage, { "usage.input_tokens": 100, "usage.output_tokens": 20, estimated_cost_usd: 0.01 });
    assert.deepEqual(report.samples[0]!.additionalReportedModels, ["utility-model"]);
    assert.equal(report.samples[0]!.reportedModels?.["utility-model"]?.inputTokens, 10);
    assert.deepEqual(report.samples[1]!.reportedUsage, { "last.inputTokens": 30, "total.inputTokens": 300 });
    assert.equal(report.samples[2]!.usagePresent, false); assert.deepEqual(report.samples[2]!.reportedUsage, {});
    assert.equal(JSON.stringify(report).includes("private-canary"), false); assert.equal(report.avoidedTokens, null);
    appendFileSync(join(jobs[0]!.directory, "provider-result.json"), "\n");
    assert.equal(providerTelemetry(jobs).counts.invalid, 1);
    assert.throws(() => providerTelemetry(Array(1001).fill(jobs[0])), /at most 1000/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
