import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextCommand, contextStateRoot } from "../src/context-command.ts";

test("context command captures source and stores a source-free receipt outside the workspace", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-command-")), previous = process.env["XDG_STATE_HOME"];
  process.env["XDG_STATE_HOME"] = join(directory, "state");
  try {
    writeFileSync(join(directory, "rules.md"), "Always verify the selected source.");
    writeFileSync(join(directory, "source.ts"), "const uniquePrivateSourceText = 123;");
    const packet = await contextCommand(["--purpose", "find bug", "--revision", "task-1", "--required-path", "rules.md", "--optional-path", "source.ts"], directory);
    assert.equal(packet.decision?.reason, "off");
    assert.deepEqual(packet.entries.map(entry => entry.id), ["rules.md", "source.ts"]);
    writeFileSync(join(directory, "source.ts"), "changed after capture");
    assert.equal(packet.entries[1]!.excerpt, "const uniquePrivateSourceText = 123;");
    const receipt = readFileSync(join(contextStateRoot(directory), "receipts", `${packet.receiptId}.json`), "utf8");
    assert.ok(!receipt.includes("uniquePrivateSourceText"));
    assert.ok(receipt.includes(packet.entries[1]!.sourceDigest));
    writeFileSync(join(directory, "single.ts"), "x".repeat(3000));
    const bounded = await contextCommand(["--purpose", "find bug", "--revision", "task-2",
      "--optional-path", "single.ts", "--optional-excerpt-bytes", "256",
      "--maximum-bytes", "5000"], directory);
    assert.deepEqual(bounded.omitted, ["single.ts"]);
    assert.equal(bounded.omissionReasons["single.ts"], "excerpt-unrepresentable");
    const boundedReceipt = JSON.parse(readFileSync(join(contextStateRoot(directory), "receipts",
      `${bounded.receiptId}.json`), "utf8"));
    assert.equal(boundedReceipt.omissionReasons["single.ts"], "excerpt-unrepresentable");
    symlinkSync(join(directory, "source.ts"), join(directory, "alias.ts"));
    await assert.rejects(contextCommand(["--purpose", "find bug", "--revision", "1", "--optional-path", "alias.ts"], directory));
  } finally {
    if (previous === undefined) delete process.env["XDG_STATE_HOME"]; else process.env["XDG_STATE_HOME"] = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source edits during ranking refuse delivery while retaining decision usage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "context-stale-")), previous = process.env["XDG_STATE_HOME"];
  process.env["XDG_STATE_HOME"] = join(directory, "state");
  try {
    const original = "find bug here\n" + "unrelated context\n".repeat(100);
    writeFileSync(join(directory, "source.ts"), original);
    const { digest } = await import("../src/core.ts");
    await assert.rejects(contextCommand(["--purpose", "find bug", "--revision", "1", "--optional-path", "source.ts", "--optional-excerpt-bytes", "160"], directory, {
      async decide(request) {
        assert.equal(request.candidates[0]!.excerpt, original, "adapter bounds classifier evidence independently of delivery excerpts");
        assert.ok(!request.candidates[0]!.excerpt.includes("outside excerpt"));
        writeFileSync(join(directory, "source.ts"), original + "outside excerpt changed\n");
        return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: ["source.ts"], suggested: null,
          method: "baseline", reason: "fixture", model: null, questionVersion: "1", confidence: null, latencyMs: 1,
          usage: { inputTokens: 123, outputTokens: 7 } };
      },
    }), /sources changed/);
    const { readdirSync } = await import("node:fs");
    const receipts = join(contextStateRoot(directory), "receipts");
    const result = JSON.parse(readFileSync(join(receipts, readdirSync(receipts)[0]!), "utf8"));
    assert.equal(result.outcome, "refused-stale-source");
    assert.equal(result.decision.usage.inputTokens, 123);
    assert.deepEqual(result.staleSources, ["source.ts"]);
    assert.notEqual(contextStateRoot(directory), contextStateRoot(tmpdir()));
  } finally {
    if (previous === undefined) delete process.env["XDG_STATE_HOME"]; else process.env["XDG_STATE_HOME"] = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
