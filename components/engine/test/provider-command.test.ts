import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerCommand } from "../src/provider-command.ts";

test("all native invocation plans retain exact selection and keep assignment out of argv", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-plan-")));
  try {
    const alias = join(root, "alias"); symlinkSync(root, alias);
    for (const provider of ["claude", "gemini", "codex"] as const) {
      const plan = providerCommand({ id: "job", provider, workspace: alias, additionalRoots: [root, alias],
        executable: process.execPath, model: "explicit-model", effort: "high", prompt: "private assignment $()",
        deadlineMs: 1500, outputLimit: 100000, conversationId: "exact-session", requiredTools: ["command", "command"] }, join(root, "job"));
      assert.equal(plan.operation.cwd, root);
      assert.equal(plan.operation.argv.includes("private assignment $()"), false);
      assert.deepEqual(plan.provider, { kind: provider, model: "explicit-model", effort: "high", conversationId: "exact-session", requiredTools: ["command"], additionalRoots: [], access: "exclusive" });
      assert.equal(provider === "gemini" ? JSON.parse(plan.stdin!).message.content : plan.stdin, "private assignment $()");
      if (provider === "gemini") assert.equal(plan.operation.argv[plan.operation.argv.indexOf("--print-timeout") + 1], "2s");
      if (provider === "codex") assert.deepEqual(plan.operation.argv.slice(1), ["app-server", "--stdio"]);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invocation planning refuses uncarried scope and invalid owner limits before dispatch", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-plan-")));
  const base = { id: "job", provider: "codex" as const, workspace: root, executable: process.execPath,
    model: "explicit-model", effort: "high", prompt: "task", deadlineMs: 1000, outputLimit: 10000 };
  try {
    for (const deadlineMs of [-1, 604800001, NaN]) assert.throws(() => providerCommand({ ...base, deadlineMs }, root), /deadline/);
    assert.equal(providerCommand({ ...base, deadlineMs: 0, idleTimeoutMs: 0 }, root).deadlineMs, 0);
    assert.throws(() => providerCommand({ ...base, prompt: "é".repeat(250001) }, root), /500 KB/);
    assert.throws(() => providerCommand({ ...base, additionalRoots: [realpathSync(tmpdir())] }, root), /structured assignment/);
    assert.throws(() => providerCommand({ ...base, conversationId: "--other" }, root), /conversation/);
    assert.throws(() => providerCommand({ ...base, requiredTools: Array(129).fill("command") }, root), /required provider tools/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
