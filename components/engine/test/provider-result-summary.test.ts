import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableJson, fileDigest } from "../src/core.ts";
import type { CommandReceipt } from "../src/process-owner.ts";
import { providerResultSummary } from "../src/provider-result-summary.ts";

test("public completion is bounded, excludes extra raw fields and verifies the exact result bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "provider-summary-"));
  try {
    const path = join(root, "provider-result.json");
    durableJson(path, { version: 1, requestDigest: "fixture", state: "succeeded", identity: { conversationId: "session", model: "model", requestedEffort: "high", reportedEffort: null, permissions: "full", privateReasoning: "private-canary" },
      completion: { outcome: "completed", answer: "a".repeat(17000), artifacts: Array(25).fill("/artifact"), sources: [], checks: [], remaining: [], extra: "private-canary" }, raw: "private-canary" });
    const receipt = { requestDigest: "fixture", providerResult: path, providerResultDigest: fileDigest(path) } as CommandReceipt;
    const result = providerResultSummary(receipt)!;
    assert.equal(result.truncated, true); assert.equal(result.completion!.answer.length, 16000);
    assert.equal(result.completion!.artifacts.length, 20); assert.equal(result.identity!.reportedEffort, null);
    assert.equal(JSON.stringify(result).includes("private-canary"), false);
    assert.equal(result.evidence.digest, receipt.providerResultDigest);
    appendFileSync(path, "\n"); assert.throws(() => providerResultSummary(receipt), /changed during observation/);
    assert.equal(providerResultSummary(null), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
