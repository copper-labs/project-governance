import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, durableJson, fileDigest } from "../src/core.ts";
import { providerCommand } from "../src/provider-command.ts";
import { providerFollowUp } from "../src/provider-follow-up.ts";

test("follow-up preserves native binding and rejects uncertain or altered parent evidence", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-follow-")));
  try {
    for (const provider of ["claude", "gemini", "codex"] as const) {
      const directory = join(root, provider);
      const prior = { ...providerCommand({ id: "parent", provider, workspace: root, prompt: "original",
        model: "exact-model", effort: "high", executable: process.execPath, deadlineMs: 1000, outputLimit: 10000,
        requiredTools: ["command"], assignment: { role: "reviewer", constraints: "No publishing", context: "Original evidence" } }, directory), version: 1, ownerDigest: "fixture" };
      const hash = digest(prior);
      durableJson(join(directory, "request.json"), prior);
      const resultPath = join(directory, "provider-result.json");
      const identity = { model: "exact-model", requestedEffort: "high", reportedEffort: null,
        conversationId: "verified-session", permissions: { claude: "bypassPermissions", gemini: "always-proceed", codex: "dangerFullAccess" }[provider] };
      const result = { version: 1, requestDigest: hash, identity, state: "blocked" };
      durableJson(resultPath, result);
      const receipt = { version: 1, requestDigest: hash, state: "failed", cleanup: "confirmed",
        providerResult: resultPath, providerResultDigest: fileDigest(resultPath) };
      durableJson(join(directory, "result.json"), receipt);
      const next = { id: "next", directory: join(root, `${provider}-next`), prompt: "continue" };
      const planned = providerFollowUp(directory, hash, next);
      assert.equal(planned.command.provider!.conversationId, "verified-session");
      assert.equal(planned.command.provider!.model, "exact-model");
      assert.equal(planned.parent.resultDigest, receipt.providerResultDigest);
      assert.equal(planned.command.operation.cwd, root);
      assert.deepEqual(planned.command.provider!.requiredTools, ["command"]);
      assert.equal(planned.command.assignment!.task, "continue");
      assert.equal(planned.command.assignment!.constraints, "No publishing");
      assert.equal(planned.command.assignment!.context, "Original evidence");
      const prompt = provider === "gemini" ? JSON.parse(planned.command.stdin!).message.content : planned.command.stdin;
      assert.ok(prompt.endsWith("Assignment:\ncontinue"));
      assert.throws(() => providerFollowUp(directory, hash, { ...next, id: "parent" }), /distinct job/);
      durableJson(join(directory, "result.json"), { ...receipt, cleanup: "unknown" });
      assert.throws(() => providerFollowUp(directory, hash, next), /confirmed cleanup/);
      durableJson(join(directory, "result.json"), receipt);
      durableJson(resultPath, { ...result, identity: { ...identity, model: "different" } });
      assert.throws(() => providerFollowUp(directory, hash, next), /result identity mismatch/);
      durableJson(join(directory, "result.json"), { ...receipt, providerResultDigest: fileDigest(resultPath) });
      assert.throws(() => providerFollowUp(directory, hash, next), /identity drift/);
      assert.throws(() => providerFollowUp(directory, "wrong", next), /request identity mismatch/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
