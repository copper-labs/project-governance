import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { providerContext, validateProviderContext } from "../src/provider-context.ts";
import { decisionTaskContext, readDecisionTaskContext } from "../src/decision-task-context.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";

test("large unrelated test evidence cannot block a governed review or enter automatic inference", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-large-evidence-")));
  const previousState = process.env.XDG_STATE_HOME, previousToken = process.env.JEV_TOKEN, previousFetch = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "fixture-only";
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "docs/specs"), { recursive: true });
    mkdirSync(join(root, "docs/developer"), { recursive: true });
    mkdirSync(join(root, "docs/evidence/run"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "state/\n");
    const profile = { profile_id: "fixture", documentation: { enabled: true, root: "docs/developer", research: "disabled" },
      context_router: { default_route: "review", routes: [{ id: "review",
      match: { prompt_terms: ["review"] }, primary_context: ["rules.md"] }] }, continuity: { decisions: {
      mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["docs/**"], allowed_source_paths: ["docs/**"],
      consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } },
    } } };
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
    writeFileSync(join(root, "rules.md"), "MANDATORY: preserve unrelated work and never waive required checks.");
    writeFileSync(join(root, "docs/specs/sync.md"), "# Sync specification\n\nRetain source identities when synchronizing.\n");
    writeFileSync(join(root, "docs/specs/plan.md"), "# Integration plan\n\nProve synchronization without losing evidence.\n");
    const liveGuide = "docs/evidence/run/live-guide.md";
    writeFileSync(join(root, "docs/developer/catalog.yaml"), JSON.stringify({ version: 1, capabilities: [{ id: "sync", title: "Sync",
      reference: "docs/specs/sync.md", guides: [liveGuide], sources: ["docs/evidence/run/review.md"] }] }));
    git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
    const artifact = "docs/evidence/run/samples.json", rawReport = "docs/evidence/run/review.md", summary = "docs/evidence/run/README.md";
    writeFileSync(join(root, artifact), Buffer.alloc(17 * 1024 * 1024, 0x61));
    writeFileSync(join(root, rawReport), "RAW_REVIEW_MARKER: retained original evidence\n");
    writeFileSync(join(root, summary), "# Evidence summary\n\nThe retained load test completed.\n");
    writeFileSync(join(root, liveGuide), "# Live sync guide\n\nLIVE_CATALOG_GUIDE: revalidate captured identities.\n");
    let calls = 0;
    globalThis.fetch = async (_url, input) => {
      calls++; const body = String(input?.body);
      assert.ok(!body.includes(artifact) && !body.includes(rawReport) && !body.includes("RAW_REVIEW_MARKER"));
      const request = JSON.parse(body);
      return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(request.questions)
        .map(name => [name, { type: "noul", noul: 0.9 }])) });
    };
    const task = decisionTaskContext({ version: 1, workspace: root, taskId: "sync-review", revision: "r1",
      requirement: "Review the sync specification and integration plan", acceptance: ["Find actionable design defects"],
      sourcePaths: ["docs/specs/sync.md", "docs/specs/plan.md"] }, root);
    const prepared = await providerContext(root, task, {}, resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(prepared.delivery.status, "prepared-for-native-input"); assert.ok(calls > 0);
    assert.match(prepared.text, /MANDATORY:/);
    assert.ok(prepared.text.includes("Retain source identities") && prepared.text.includes("Prove synchronization"));
    validateProviderContext(root, prepared.delivery, prepared.text);
    assert.ok(!prepared.text.includes("RAW_REVIEW_MARKER") && !prepared.text.includes(artifact));
    assert.ok("receipt" in prepared.delivery);
    const receipt = JSON.parse(readFileSync(prepared.delivery.receipt, "utf8"));
    assert.ok(receipt.metadata.catalog.candidates.some((item: { path: string }) => item.path === summary));
    assert.ok(receipt.metadata.catalog.candidates.some((item: { path: string }) => item.path === liveGuide));
    assert.ok(prepared.text.includes("LIVE_CATALOG_GUIDE"));
    assert.ok(receipt.metadata.catalog.excluded.some((item: { path: string; reason: string }) => item.path === artifact && item.reason === "automatic-path-excluded"));
    const captured = new ValidationSubject(root, resolveChangeScope(root, { baseRef: "HEAD" }));
    assert.ok(captured.paths().includes(artifact), "Artifact exclusions cannot change the validation subject");
    delete process.env.JEV_TOKEN;
    const explicit = await contextRouteCommand(["--task", "Review retained original evidence", "--revision", "r2", "--optional-path", rawReport],
      root, resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(explicit.ready, true); assert.ok(explicit.optional?.entries.some(item => item.id === rawReport));
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
    rmSync(root, { recursive: true, force: true });
  }
});

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
    const unsharedProfile = { ...profile, continuity: { decisions: { ...profile.continuity.decisions, allowed_source_paths: [] as string[] } } };
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(unsharedProfile));
    process.env.JEV_TOKEN = "fixture-only";
    const unshared = await providerContext(root, { ...task, revision: "r3" }, {}, assets);
    assert.equal(calls, 1, "no source-sharing declaration means no classifier transmission");
    assert.ok(unshared.text.includes("src/feature.ts"), "explicit provider sources retain deterministic delivery");
    assert.ok(unshared.text.includes("UNAPPROVED_SOURCE_CONTENT"));
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    const sources = Array.from({ length: 12 }, (_, i) => `src/large${i}.ts`);
    for (const path of sources) writeFileSync(join(root, path), original);
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ ...profile,
      continuity: { decisions: { ...profile.continuity.decisions, allowed_source_paths: ["src/large*.ts"], evidence_bytes: 8192 } } }));
    const large = await providerContext(root, { ...task, revision: "r4", sourcePaths: sources }, {}, assets);
    assert.ok("receipt" in large.delivery);
    const largeReceipt = JSON.parse(readFileSync(large.delivery.receipt, "utf8"));
    assert.equal(calls, 2, "classifier excerpts can be smaller than delivered excerpts");
    assert.equal(largeReceipt.relevanceAdvice.assessed.length, 12);
    assert.ok(largeReceipt.relevanceAdvice.coverage.truncated);
    const sections = "# Launch\n" + "Launch evidence.\n".repeat(180) + "# Cleanup\n" + "Cleanup ownership.\n".repeat(180);
    writeFileSync(join(root, "src/sections.md"), sections);
    delete process.env.JEV_TOKEN;
    const multi = await providerContext(root, { ...task, revision: "multi-range", requirement: "Fix launch and cleanup",
      sourcePaths: ["src/sections.md"] }, {}, assets);
    const ranged = (multi.delivery as any).sources.find((source: any) => source.path === "src/sections.md");
    assert.equal(ranged.range, null);
    assert.equal(ranged.ranges.length, 2, "provider input retains both original ranges rather than implying a whole file");
    assert.ok(ranged.ranges.every((range: any) => range.complete === false && range.excerptDigest.startsWith("sha256:")));
    validateProviderContext(root, multi.delivery, multi.text);
    process.env.JEV_TOKEN = "fixture-only";
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
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
