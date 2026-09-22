import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { providerContext, validateProviderContext } from "../src/provider-context.ts";
import { decisionTaskContext, readDecisionTaskContext } from "../src/decision-task-context.ts";

test("bound provider context selects before native input and retains mandatory rules, retrieval and fallback", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-context-")));
  const previousState = process.env.XDG_STATE_HOME, previousToken = process.env.JEV_TOKEN, previousFetch = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "fixture-only";
  let calls = 0;
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, ".gitignore"), "state/\n");
    const profile = { profile_id: "fixture", context_router: { routes: [{ id: "fix", match: { prompt_terms: ["fix"] },
      primary_context: ["rules.md"], skills: ["test-execution"] }] }, continuity: { decisions: {
      mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/feature.ts"], consumers: { DL03: { mode: "auto" } },
    } } };
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
    writeFileSync(join(root, "rules.md"), "MANDATORY: preserve unrelated work and all failures.");
    const original = Array.from({ length: 500 }, (_, index) => `export const feature${index} = 'bounded feature example';`).join("\n");
    writeFileSync(join(root, "src/feature.ts"), original);
    writeFileSync(join(root, "src/unapproved.ts"), "UNAPPROVED_SOURCE_CONTENT");
    git("add", "config", "rules.md", "src");
    const task = decisionTaskContext({ version: 1, workspace: root, taskId: "feature-fix", revision: "r1",
      requirement: "Fix the feature", acceptance: ["Preserve the known behavior"], sourcePaths: ["src/feature.ts", "src/unapproved.ts"] }, root);
    globalThis.fetch = async (_url, input) => {
      calls++;
      assert.ok(!String(input?.body).includes("UNAPPROVED_SOURCE_CONTENT"));
      const request = JSON.parse(String(input?.body));
      assert.ok(!JSON.stringify(request).includes("MANDATORY:"), "mandatory rules never become optional classification input");
      return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions).map(name => [name, { type: "noul", noul: 0.9 }])) });
    };
    const assets = resolve("src/project_governance_runtime/assets/skills");
    const prepared = await providerContext(root, task, {}, assets);
    assert.equal(calls, 1);
    validateProviderContext(root, prepared.delivery, `Original assignment\n\n${prepared.text}`);
    assert.throws(() => validateProviderContext(root, prepared.delivery, prepared.text + "changed"), /intact/);
    assert.equal(prepared.delivery.status, "prepared-for-native-input");
    assert.ok(prepared.text.includes("MANDATORY:"));
    assert.ok(prepared.text.includes('"complete":false'));
    assert.ok(!prepared.text.includes(original));
    assert.ok("deliveredBytes" in prepared.delivery && prepared.delivery.deliveredBytes < Buffer.byteLength(original));
    assert.ok("receipt" in prepared.delivery && readFileSync(prepared.delivery.receipt, "utf8").includes("sourceDigest"));
    await providerContext(root, task, {}, assets);
    assert.equal(calls, 1, "same task evidence reuses JEV decision");
    delete process.env.JEV_TOKEN;
    const fallback = await providerContext(root, { ...task, revision: "r2" }, {}, assets);
    assert.equal(calls, 1);
    assert.equal(fallback.delivery.reason, "missing-token");
    assert.ok(fallback.text.includes("MANDATORY:"));
    assert.ok(fallback.text.includes("src/feature.ts"));
    assert.equal((await providerContext(root, undefined)).delivery.reason, "task-context-unavailable");
    const file = join(root, "context.json"); writeFileSync(file, JSON.stringify(task));
    assert.deepEqual(readDecisionTaskContext(file, root), task);
    assert.throws(() => decisionTaskContext({ ...task, sourcePaths: ["../elsewhere"] }, root));
    assert.throws(() => decisionTaskContext({ ...task, workspace: join(root, "src") }, root), /another workspace/);
    writeFileSync(join(root, "src/feature.ts"), original + "\n// changed source\n");
    assert.throws(() => validateProviderContext(root, prepared.delivery, prepared.text), /changed before dispatch/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    rmSync(root, { recursive: true, force: true });
  }
});
