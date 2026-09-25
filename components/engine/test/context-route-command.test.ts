import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { automaticContextCandidates } from "../src/context-candidates.ts";
import type { ValidationSubject } from "../src/change-subject.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { digest } from "../src/core.ts";
import type { DecisionProvider } from "../src/decisions.ts";

test("routed command captures staged policy, delivers mandatory content and writes source-free evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-route-")), previous = process.env.XDG_STATE_HOME;
  const assets = resolve("src/project_governance_runtime/assets/skills");
  process.env.XDG_STATE_HOME = join(root, "state");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    const profile = { profile_id: "fixture", context_router: { routes: [{ id: "fix", match: { prompt_terms: ["fix"] },
      primary_context: ["rules.md"], skills: ["test-execution"] }] } };
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
    writeFileSync(join(root, "rules.md"), "private mandatory policy content");
    git("add", "config", "rules.md");
    writeFileSync(join(root, "rules.md"), "unstaged replacement");
    const result = await contextRouteCommand(["--task", "fix", "--revision", "1", "--staged"], root, assets);
    assert.equal(result.ready, true);
    assert.equal(result.entries[0]?.content, "private mandatory policy content");
    assert.deepEqual(result.skills?.entries.map(skill => skill.id), ["test-execution"]);
    const receipt = readFileSync(join(contextStateRoot(root), "routes", `${result.receiptId}.json`), "utf8");
    assert.ok(!receipt.includes("private mandatory policy content"));
    assert.ok(receipt.includes(result.entries[0]!.sourceDigest));
    writeFileSync(join(root, "optional.ts"), "private optional source");
    let calls = 0;
    const provider: DecisionProvider = { async decide(request) {
      calls++;
      assert.deepEqual(request.candidates.map(candidate => candidate.id), ["optional.ts"]);
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: ["optional.ts"], suggested: null,
        method: "baseline", reason: "fixture", model: null, questionVersion: "1", confidence: null, latencyMs: 1,
        usage: { inputTokens: 4, outputTokens: 1 } };
    } };
    const assisted = await contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts", "--optional-path", "rules.md"], root, assets, provider);
    assert.equal(calls, 1);
    assert.equal(assisted.entries[0]?.content, "unstaged replacement");
    assert.equal(assisted.optional?.entries[0]?.excerpt, "private optional source");
    assert.equal(assisted.selection.automatic.priorityPreview.find(item => item.path === "optional.ts")?.disposition,
      "explicit-optional", "explicit delivery overrides automatic sharing rejection in the preview");
    const declared = await contextRouteCommand(["--task", "fix", "--revision", "2"], root, assets,
      provider, {}, { version: 1, workspace: root, taskId: "fixture-task", revision: "2", requirement: "fix",
        acceptance: [], sourcePaths: ["optional.ts"] });
    assert.equal(declared.selection.automatic.priorityPreview.find(item => item.path === "optional.ts")?.disposition,
      "task-declared", "task scope admission overrides automatic sharing rejection in the preview");
    assert.equal(assisted.optional?.measurement.tokenSavings, null);
    const fallback = await contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts"], root, assets,
      { async decide() { throw new Error("unavailable"); } });
    assert.equal(fallback.ready, true);
    assert.equal(fallback.optional?.reason, "provider-unavailable");
    writeFileSync(join(root, "single.ts"), "x".repeat(3000));
    const single = await contextRouteCommand(["--task", "fix", "--revision", "single-line",
      "--optional-path", "single.ts"], root, assets, { async decide(request) {
      const order = request.candidates.map(candidate => candidate.id);
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: order,
        suggested: null, method: "baseline", reason: "fixture", model: null, questionVersion: "1",
        confidence: null, latencyMs: 1, usage: { inputTokens: null, outputTokens: null } };
    } });
    assert.ok(!single.optional?.entries.some(entry => entry.id === "single.ts"));
    assert.ok(single.optional?.entries.some(entry => entry.id === "optional.ts"), "safe local candidates remain available without sharing approval");
    assert.equal(single.optional?.omissionReasons["single.ts"], "excerpt-unrepresentable");
    assert.equal(single.selection.reason, "fixture");
    assert.equal(single.selection.optionalDelivery, "delivered");
    assert.equal(single.selection.optionalOmissionReasons["single.ts"], "excerpt-unrepresentable");
    const singleReceipt = JSON.parse(readFileSync(join(contextStateRoot(root), "routes",
      `${single.receiptId}.json`), "utf8"));
    assert.equal(singleReceipt.optional.omissionReasons["single.ts"], "excerpt-unrepresentable");
    writeFileSync(join(root, "long.ts"), Array.from({ length: 120 }, (_, index) =>
      `Line ${index}: source for the fix and its verification.\n`).join(""));
    const clipped = await contextRouteCommand(["--task", "fix", "--revision", "clipped",
      "--optional-path", "long.ts"], root, assets, { async decide(request) {
      return { version: 1, kind: request.kind, inputDigest: digest(request),
        delivered: request.candidates.map(candidate => candidate.id), suggested: null,
        method: "baseline", reason: "fixture", model: null, questionVersion: "1",
        confidence: null, latencyMs: 1, usage: { inputTokens: null, outputTokens: null } };
    } });
    assert.equal(clipped.optional?.entries[0]?.sourceRange?.complete, false);
    assert.deepEqual(clipped.selection.optionalClippedPaths, ["long.ts"]);
    assert.deepEqual(JSON.parse(readFileSync(join(contextStateRoot(root), "routes",
      `${clipped.receiptId}.json`), "utf8")).selection.optionalClippedPaths, ["long.ts"]);
    const tokenBefore = process.env.JEV_TOKEN, fetchBefore = globalThis.fetch;
    let networkCalls = 0;
    try {
      delete process.env.JEV_TOKEN;
      globalThis.fetch = async () => { networkCalls++; throw new Error("Network must not be used without a token"); };
      const noTokenProfile = { ...profile, continuity: { decisions: {
        provider: "jev", mode: "auto", allowed_questions: ["rank_optional_context"], allowed_data_classes: ["source"], allowed_source_paths: ["optional.ts"],
      } } };
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(noTokenProfile));
      const noToken = await contextRouteCommand(["--task", "fix", "--revision", "no-token", "--optional-path", "optional.ts"], root, assets);
      assert.equal(noToken.ready, true);
      assert.equal(noToken.optional?.reason, "missing-token");
      assert.equal(noToken.entries[0]?.content, "unstaged replacement");
      assert.deepEqual(noToken.skills?.entries.map(skill => skill.id), ["test-execution"]);
      assert.equal(noToken.optional?.entries[0]?.excerpt, "private optional source");
      assert.equal(noToken.selection.reason, "missing-token");
      assert.equal(noToken.selection.optionalDelivery, "delivered");
      assert.equal(networkCalls, 0);
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ ...noTokenProfile,
        context_router: { ...profile.context_router, routes: [{ ...profile.context_router.routes[0],
          token_budget: { expansion_context_tokens: 1 } }] } }));
      const cramped = await contextRouteCommand(["--task", "fix", "--revision", "cramped",
        "--optional-path", "optional.ts"], root, assets);
      assert.equal(cramped.optional?.reason, "missing-token");
      assert.deepEqual(cramped.optional?.entries, []);
      assert.equal(cramped.selection.reason, "missing-token");
      assert.equal(cramped.selection.optionalDelivery, "none");
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(noTokenProfile));
      process.env.JEV_TOKEN = "fixture-only";
      const legacyUnbound = await contextRouteCommand(["--task", "fix", "--revision", "legacy", "--optional-path", "optional.ts"], root, assets);
      assert.equal(legacyUnbound.optional?.reason, "scope-unavailable");
      assert.equal(networkCalls, 0);
      globalThis.fetch = async (_url, init) => {
        networkCalls++;
        const payload = JSON.parse(String(init?.body));
        return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(payload.questions).map(([name, question]) => {
          const keys = Object.keys((question as any).criteria), choice = keys.find(key => key !== "unknown")!;
          return [name, { type: "choice", choice, confidence: 0.9, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) }];
        })), usage: { input_tokens: 10, output_tokens: 2 } });
      };
      const legacyArgs = ["--task", "fix", "--revision", "legacy", "--decision-task", "legacy-task", "--optional-path", "optional.ts"];
      const legacy = await contextRouteCommand(legacyArgs, root, assets);
      assert.equal(legacy.optional?.decision?.questionVersion, "legacy.context-rank/1");
      assert.equal(legacy.optional?.decision?.method, "jev");
      await contextRouteCommand(legacyArgs, root, assets);
      assert.equal(networkCalls, 1, "Repeated migrated caller reuses its decision");
      networkCalls = 0;
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ ...profile, continuity: { decisions: {
        mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["optional.ts"], consumers: { DL03: { mode: "auto" } },
      } } }));
      process.env.JEV_TOKEN = "fixture-only";
      globalThis.fetch = async () => {
        networkCalls++;
        return Response.json({ model: "jev-1.13.0", answers: { q1: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 2 } });
      };
      const unbound = await contextRouteCommand(["--task", "fix", "--revision", "expanded", "--optional-path", "optional.ts"], root, assets);
      assert.equal(unbound.relevanceAdvice?.reason, "scope-unavailable");
      assert.equal(networkCalls, 0);
      const expanded = await contextRouteCommand(["--task", "fix", "--decision-task", "fixture-task", "--revision", "expanded", "--optional-path", "optional.ts"], root, assets);
      assert.equal(expanded.relevanceAdvice?.delivered, true);
      assert.equal(expanded.optional?.decision?.questionVersion, "context.relevance/1");
      assert.equal(expanded.entries[0]?.content, "unstaged replacement");
      assert.equal(networkCalls, 1);
    } finally {
      if (tokenBefore === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = tokenBefore;
      globalThis.fetch = fetchBefore;
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    }
    const controller = new AbortController(); controller.abort(); const callsBefore = calls;
    const cancelled = await contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts"], root, assets, provider, { signal: controller.signal });
    assert.equal(calls, callsBefore); assert.equal(cancelled.optional?.reason, "cancelled");
    assert.equal(cancelled.ready, true); assert.equal(cancelled.entries[0]?.content, "unstaged replacement");
    await assert.rejects(() => contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts"], root, assets, {
      async decide(request) { writeFileSync(join(root, "optional.ts"), "changed during advice"); return provider.decide(request); },
    }), /sources changed/);
    writeFileSync(join(root, ".gitignore"), ".governance/\nstate/\n");
    const localPath = join(root, ".governance/runtime/skills/local/SKILL.md");
    mkdirSync(join(root, ".governance/runtime/skills/local"), { recursive: true });
    writeFileSync(localPath, "local project guidance");
    profile.context_router.routes[0]!.skills = ["local"];
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    const local = await contextRouteCommand(["--task", "fix", "--revision", "local"], root, assets);
    assert.equal(local.ready, true);
    assert.equal(local.skills?.entries[0]?.content, "local project guidance");
    git("add", "config/governance/profile.yaml");
    const stagedLocal = await contextRouteCommand(["--task", "fix", "--revision", "local", "--staged"], root, assets);
    assert.equal(stagedLocal.ready, false);
    assert.ok(stagedLocal.blockers.includes("skill-unavailable:local"));
    await assert.rejects(() => contextRouteCommand(["--task", "fix", "--revision", "local", "--optional-path", "optional.ts"], root, assets, {
      async decide(request) { writeFileSync(localPath, "changed local guidance"); return provider.decide(request); },
    }), /sources changed/);
    profile.context_router.routes[0]!.skills = ["missing-skill"];
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    const priorCalls = calls;
    const blocked = await contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts"], root, assets, provider);
    assert.equal(calls, priorCalls);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes("skill-unavailable:missing-skill"));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "wrong" }));
    await assert.rejects(() => contextRouteCommand(["--task", "fix", "--revision", "3"], root, assets), /identity mismatch/);
    await assert.rejects(() => contextRouteCommand(["--task", "fix", "--revision", "3", "--staged", "--base-ref", "HEAD"], root, assets), /Staged/);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("expanded context advice gets a new event when approved source policy changes", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-policy-event-"));
  const assets = resolve("src/project_governance_runtime/assets/skills");
  const previousState = process.env.XDG_STATE_HOME, previousToken = process.env.JEV_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "fixture-only";
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  let calls = 0;
  try {
    git("init", "-q");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, ".gitignore"), "state/\n");
    const profile = (paths: string[]) => ({ context_router: { routes: [{ id: "fix",
      match: { prompt_terms: ["fix"] }, primary_context: ["rules.md"] }] },
      continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
        allowed_source_paths: paths, consumers: { DL03: { mode: "auto" } } } } });
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile(["docs/one.md"])));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ facts: {} }));
    writeFileSync(join(root, "rules.md"), "Required policy\n");
    writeFileSync(join(root, "docs/one.md"), "Source evidence\n");
    git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-qm", "initial policy");
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ model: "jev-1.13.0", answers: { q1: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 10, output_tokens: 2 } });
    };
    const args = ["--task", "fix", "--revision", "same-revision", "--decision-task", "fixture-task",
      "--optional-path", "docs/one.md"];
    const first = await contextRouteCommand(args, root, assets);
    assert.equal(first.relevanceAdvice?.delivered, true);
    await contextRouteCommand(args, root, assets);
    assert.equal(calls, 1, "unchanged policy reuses the same decision");
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile(["docs/one.md", "docs/two.md"])));
    git("add", "config/governance/profile.yaml");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-qm", "broaden classifier approval");
    const changed = await contextRouteCommand(args, root, assets);
    assert.equal(changed.relevanceAdvice?.delivered, true);
    assert.equal(calls, 2, "a changed approval policy must not replay the old event");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit routing paths isolate task guidance without narrowing captured source identity",async()=>{
 const root=mkdtempSync(join(tmpdir(),"context-path-scope-")),previous=process.env.XDG_STATE_HOME;
 process.env.XDG_STATE_HOME=join(root,"state");
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
 try {
  git("init");git("-c","user.name=Test","-c","user.email=test@example.invalid","commit","--allow-empty","-m","fixture");
  mkdirSync(join(root,"config/governance"),{recursive:true});mkdirSync(join(root,"app"));mkdirSync(join(root,"tools"));
  writeFileSync(join(root,".gitignore"),"state/\n");
  writeFileSync(join(root,"config/governance/profile.yaml"),JSON.stringify({context_router:{routes:[
   {id:"application",match:{path_globs:["app/**"]},primary_context:["app.md"]},
   {id:"build",match:{path_globs:["tools/**"]},primary_context:["build.md"]}
  ]}}));
  writeFileSync(join(root,"config/governance/facts.lock.yaml"),JSON.stringify({facts:{}}));
  for(const name of ["app/a.ts","app/b.ts","tools/build.ts","app.md","build.md"])writeFileSync(join(root,name),name);
  const assets=resolve("src/project_governance_runtime/assets/skills"),args=["--task","change","--revision","scoped"];
  const broad=await contextRouteCommand(args,root,assets);
  const focused=await contextRouteCommand([...args,"--changed-path","tools/build.ts"],root,assets);
  assert.equal(broad.route.selected?.id,"application");assert.equal(focused.route.selected?.id,"build");
  assert.deepEqual(focused.source,broad.source);assert.notEqual(focused.inputDigest,broad.inputDigest);
  assert.deepEqual(focused.routingPaths,{mode:"explicit",paths:["tools/build.ts"]});
  assert.equal(focused.entries[0]?.content,"build.md");
  await assert.rejects(contextRouteCommand([...args,"--changed-path","../outside"],root,assets),/unsafe/);
 }finally{if(previous===undefined)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=previous;rmSync(root,{recursive:true,force:true});}
});

test("an explicit optional path does not turn off bounded delivery for other large candidates", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-route-excerpt-")), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "state/\n");
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({
      context_router: { routes: [{ id: "documentation", match: { path_globs: ["docs/**"] },
        primary_context: ["rules.md"] }] },
      continuity: { decisions: { mode: "off", allowed_source_paths: ["docs/**"] } },
    }));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ facts: {} }));
    writeFileSync(join(root, "rules.md"), "Required rules survive optional selection.");
    for (const name of ["important", "related"]) writeFileSync(join(root, `docs/${name}.md`),
      Array.from({ length: 320 }, (_, index) => `Line ${index + 1}: relevant design evidence for the task.\n`).join(""));
    git("add", ".");
    let observedLengths: number[] = [];
    const provider: DecisionProvider = { async decide(request) {
      observedLengths = request.candidates.map(candidate => Buffer.byteLength(candidate.excerpt));
      const order = request.candidates.map(candidate => candidate.id);
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: order,
        suggested: order, method: "jev", reason: "fixture", model: "fixture", questionVersion: "1",
        confidence: 1, latencyMs: 1, usage: { inputTokens: 10, outputTokens: 1 } };
    } };
    const packet = await contextRouteCommand(["--task", "review design", "--revision", "1",
      "--changed-path", "docs", "--optional-path", "docs/important.md"], root,
    resolve("src/project_governance_runtime/assets/skills"), provider);
    assert.equal(packet.ready, true);
    assert.equal(packet.entries[0]?.content, "Required rules survive optional selection.");
    assert.equal(packet.optional?.decision?.method, "jev");
    assert.equal(observedLengths.length, 2);
    assert.ok(observedLengths.every(length => length > 12000),
      "classifier receives the original capture and chooses its own bounded excerpts");
    assert.deepEqual(new Set(packet.optional?.entries.map(entry => entry.id)),
      new Set(["docs/important.md", "docs/related.md"]));
    assert.ok(packet.optional?.entries.every(entry =>
      entry.sourceRange?.complete === false && Buffer.byteLength(entry.excerpt) <= 2048));
    const narrower = await contextRouteCommand(["--task", "review design", "--revision", "2",
      "--changed-path", "docs", "--optional-path", "docs/important.md",
      "--optional-excerpt-bytes", "1024"], root,
    resolve("src/project_governance_runtime/assets/skills"), provider);
    assert.equal(narrower.optional?.decision?.method, "jev");
    assert.ok(narrower.optional?.entries.every(entry => Buffer.byteLength(entry.excerpt) <= 1024));
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("broad task scope admits a matching late path before the candidate cap", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-route-broad-")), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "state/\n");
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({
      context_router: { routes: [{ id: "documentation", match: { path_globs: ["docs/**"] },
        primary_context: ["rules.md"] }] },
      continuity: { decisions: { mode: "off", allowed_source_paths: ["docs/*.md"], max_candidates: 4 } },
    }));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ facts: {} }));
    writeFileSync(join(root, "rules.md"), "Required documentation policy");
    for (let index = 0; index < 70; index++) writeFileSync(join(root, `docs/a${index}.md`), "Unrelated reference\n");
    writeFileSync(join(root, "docs/z-physical-exercise-certification.md"),
      "Physical exercise certification requirements and evidence\n");
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-qm", "capture unrelated references");
    writeFileSync(join(root, "docs/a0.md"), "Changed source without matching task terms\n");
    writeFileSync(join(root, "docs/binary.md"), Buffer.from([0, 1, 2]));
    const target = "docs/z-physical-exercise-certification.md";
    const packet = await contextRouteCommand(["--task", "Find physical exercise certification requirements",
      "--revision", "1", "--changed-path", "docs", "--changed-path", "docs/a29.md"], root,
    resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(packet.ready, true);
    assert.ok(packet.selection.automatic.inventoryCount > 4);
    assert.ok(packet.selection.automatic.seeds.includes(target));
    assert.ok(packet.selection.automatic.seeds.includes("docs/a0.md"),
      "changed source retains a candidate slot ahead of unchanged path matches");
    assert.equal(packet.selection.automatic.priorityPreview[0]?.path, "docs/a29.md");
    assert.equal(packet.selection.automatic.priorityPreview[0]?.exact, true);
    assert.equal(packet.selection.automatic.priorityPreview[1]?.path, "docs/a0.md");
    assert.equal(packet.selection.automatic.priorityPreview[1]?.changed, true);
    assert.equal(packet.selection.automatic.priorityPreview[0]?.disposition, "seeded");
    assert.equal(packet.selection.automatic.priorityPreview.find(item => item.path === "docs/binary.md")?.disposition,
      "source-unavailable-or-not-bounded-text");
    assert.ok(packet.selection.automatic.priorityPreview.length > 64);
    assert.ok(packet.selection.automatic.priorityPreview.length <= 128);
    const routeReceipt = JSON.parse(readFileSync(join(contextStateRoot(root), "routes", `${packet.receiptId}.json`), "utf8"));
    assert.equal(routeReceipt.selection.automatic.priorityPreview.length, packet.selection.automatic.priorityPreview.length);
    const episode = readdirSync(join(contextStateRoot(root), "episodes"))
      .map(name => JSON.parse(readFileSync(join(contextStateRoot(root), "episodes", name), "utf8")))
      .find(item => item.native?.receiptId === packet.receiptId);
    assert.ok(episode);
    assert.equal(episode.exposure.automatic.priorityPreview, undefined,
      "Detailed path previews belong in the route receipt, not each outcome episode");
    assert.ok(packet.optional?.entries.some(entry => entry.id === target));
    assert.equal(packet.entries[0]?.content, "Required documentation policy");
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit optional source above a full automatic set still reaches JEV", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-route-cap-"));
  const previousState = process.env.XDG_STATE_HOME, previousToken = process.env.JEV_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "fixture-only";
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  let calls = 0;
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    mkdirSync(join(root, "docs")); mkdirSync(join(root, "other"));
    writeFileSync(join(root, ".gitignore"), "state/\n");
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({
      context_router: { routes: [{ id: "documentation", match: { path_globs: ["docs/**"] },
        primary_context: ["rules.md"] }] },
      continuity: { decisions: { mode: "auto", allowed_questions: ["rank_optional_context"],
        allowed_data_classes: ["source"], allowed_source_paths: ["docs/**", "other/**"] } },
    }));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ facts: {} }));
    writeFileSync(join(root, "rules.md"), "Required policy\n");
    for (let index = 0; index < 16; index++) writeFileSync(join(root, `docs/auto-${index}.md`), `Reference ${index}\n`);
    writeFileSync(join(root, "other/explicit.md"), "Explicit task evidence\n");
    git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-qm", "capture sources");
    globalThis.fetch = async (_url, init) => {
      calls++;
      const keys = Object.keys(JSON.parse(String(init?.body)).questions.suggestion.criteria);
      assert.equal(keys.length, 17, "JEV gets 16 assessed sources plus unknown");
      assert.ok(keys.includes("other/explicit.md"));
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: "other/explicit.md", confidence: 0.9,
        probabilities: Object.fromEntries(keys.map(key => [key, key === "other/explicit.md" ? 1 : 0])),
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    };
    const packet = await contextRouteCommand(["--task", "Find explicit task evidence", "--revision", "1",
      "--decision-task", "fixture", "--changed-path", "docs", "--optional-path", "other/explicit.md"], root,
    resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(packet.ready, true);
    assert.equal(packet.selection.candidateCount, 17);
    assert.equal(packet.optional?.decision?.method, "jev");
    assert.equal(packet.optional?.decision?.excerptCoverage?.length, 16);
    assert.ok(packet.optional?.entries.some(entry => entry.id === "other/explicit.md"));
    assert.equal(calls, 1);
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({
      context_router: { routes: [{ id: "documentation", match: { path_globs: ["docs/**"] },
        primary_context: ["rules.md"] }] },
      continuity: { decisions: { mode: "auto", allowed_questions: ["rank_optional_context"],
        allowed_data_classes: ["source"], allowed_source_paths: ["docs/**"] } },
    }));
    globalThis.fetch = async (_url, init) => {
      calls++;
      const wire = JSON.parse(String(init?.body));
      const keys = Object.keys(wire.questions.suggestion.criteria);
      assert.ok(!keys.includes("other/explicit.md"), "Explicit delivery must not broaden classifier sharing");
      assert.ok(!String(init?.body).includes("Explicit task evidence"));
      assert.deepEqual(wire.state.coverage, { captured: 16, omitted: 1, unavailable: 0, truncated: true });
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: keys[0], confidence: 0.9,
        probabilities: Object.fromEntries(keys.map(key => [key, key === keys[0] ? 1 : 0])),
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    };
    const scoped = await contextRouteCommand(["--task", "Find explicit task evidence", "--revision", "2",
      "--decision-task", "fixture", "--changed-path", "docs", "--optional-path", "other/explicit.md"], root,
    resolve("src/project_governance_runtime/assets/skills"));
    assert.equal(scoped.optional?.decision?.method, "jev");
    assert.ok(scoped.optional?.entries.some(entry => entry.id === "other/explicit.md"));
    const decisionReceipt = JSON.parse(readFileSync(join(contextStateRoot(root), "decisions",
      `${scoped.optional?.decision?.receiptId}.json`), "utf8"));
    assert.deepEqual(decisionReceipt.outcome.coverage.omitted, ["other/explicit.md"]);
    assert.match(decisionReceipt.outcome.coverage.limits[0], /outside approved classifier scope/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    rmSync(root, { recursive: true, force: true });
  }
});

test("a narrow candidate cap retains changed files beside stronger filename matches", () => {
  const paths = ["docs/login-timeout-guide.md", "docs/login-timeout-history.md",
    "docs/login-timeout-migration.md", "docs/changed.md", "docs/late.md"];
  const subject = { source: () => ({ file_type: "regular" }) } as unknown as ValidationSubject;
  const priority = { purpose: "Fix login timeout", exact: [] as string[], changed: ["docs/changed.md"] };
  const result = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 2, priority);
  assert.equal(result.seeds.length, 2);
  assert.equal(result.seeds[0], "docs/changed.md");
  assert.ok(result.seeds[1]?.includes("login-timeout"));
  const exact = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 2,
    { ...priority, exact: ["docs/late.md"] });
  assert.deepEqual(exact.seeds, ["docs/late.md", "docs/changed.md"]);
  const saturated = automaticContextCandidates(subject,
    ["docs/changed-1.md", "docs/changed-2.md", "docs/changed-3.md", "docs/login-timeout-guide.md"],
    new Set(), ["docs/**"], 2, { ...priority,
      changed: ["docs/changed-1.md", "docs/changed-2.md", "docs/changed-3.md"] });
  assert.deepEqual(saturated.seeds, ["docs/changed-1.md", "docs/changed-2.md"]);
  assert.ok(!saturated.seeds.includes("docs/login-timeout-guide.md"));
  assert.ok(saturated.omittedCount > 0);
  assert.equal(saturated.priorityPreview.find(item => item.path === "docs/changed-3.md")?.disposition,
    "not-inspected-seed-cap");
});

test("priority preview shows related discoveries outside the initial task scope", () => {
  const paths = ["src/feature/a.ts", "package.json", "README.md", "test/feature.test.ts"];
  const subject = { root: "/fixture", paths: () => paths,
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: (path: string) => Buffer.from(path === "package.json" ? '{"name":"fixture"}' : "source") } as unknown as ValidationSubject;
  const priority = { purpose: "Investigate feature", exact: [] as string[], changed: [] as string[] };
  const result = automaticContextCandidates(subject, ["src/feature/a.ts"], new Set(), ["**"], 8, priority);
  assert.ok(result.paths.includes("README.md"));
  assert.equal(result.priorityPreview.find(item => item.path === "README.md")?.disposition, "discovered");
  const saturated = automaticContextCandidates(subject, ["src/feature/a.ts"], new Set(), ["**"], 1, priority);
  assert.ok(saturated.priorityPreview.some(item => item.disposition === "discovery-over-cap"));
});

test("priority preview reserves room for seeds after many excluded paths", () => {
  const paths = [...Array.from({ length: 70 }, (_, index) => `src/a${index}.ts`),
    ...Array.from({ length: 40 }, (_, index) => `docs/b${index}.md`)];
  const subject = { root: "/fixture", paths: () => paths,
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: () => Buffer.from("source") } as unknown as ValidationSubject;
  const result = automaticContextCandidates(subject, paths, new Set(), ["docs/**"], 32,
    { purpose: "review", exact: [], changed: [] });
  assert.equal(result.seeds.length, 32);
  assert.ok(result.seeds.every(path => result.priorityPreview.some(item =>
    item.path === path && item.disposition === "seeded")));
  assert.ok(result.priorityPreview.length > 64);
  assert.ok(result.priorityPreview.length <= 128);
});

test("priority preview retains every discovery after excluded leaders and 32 seeds", () => {
  const excluded = Array.from({ length: 16 }, (_, index) => `src/changed-${index}.ts`);
  const seeds = Array.from({ length: 32 }, (_, index) => `docs/seed-${index}.ts`);
  const related = Array.from({ length: 20 }, (_, index) => `docs/related-${index}.md`);
  const subject = { root: "/fixture", paths: () => [...excluded, ...seeds, ...related],
    source: (path: string) => ({ file_type: "regular", identity: path }),
    read: () => Buffer.from("source") } as unknown as ValidationSubject;
  const result = automaticContextCandidates(subject, [...excluded, ...seeds], new Set(), ["docs/**"], 64,
    { purpose: "review", exact: [], changed: excluded });
  assert.equal(result.seeds.length, 32);
  assert.equal(result.discovery?.paths.length, 20);
  assert.ok(result.discovery?.paths.every(path => result.priorityPreview.some(item =>
    item.path === path && item.disposition === "discovered")));
  assert.ok(result.priorityPreview.length >= 68);
});
