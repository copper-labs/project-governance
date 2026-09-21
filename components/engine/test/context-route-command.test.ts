import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextRouteCommand } from "../src/context-route-command.ts";
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
    assert.equal(assisted.optional?.measurement.tokenSavings, null);
    const fallback = await contextRouteCommand(["--task", "fix", "--revision", "2", "--optional-path", "optional.ts"], root, assets,
      { async decide() { throw new Error("unavailable"); } });
    assert.equal(fallback.ready, true);
    assert.equal(fallback.optional?.reason, "provider-unavailable");
    const tokenBefore = process.env.JEV_TOKEN, fetchBefore = globalThis.fetch;
    let networkCalls = 0;
    try {
      delete process.env.JEV_TOKEN;
      globalThis.fetch = async () => { networkCalls++; throw new Error("Network must not be used without a token"); };
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ ...profile, continuity: { decisions: {
        provider: "jev", mode: "auto", allowed_questions: ["rank_optional_context"], allowed_data_classes: ["source"], allowed_source_paths: ["optional.ts"],
      } } }));
      const noToken = await contextRouteCommand(["--task", "fix", "--revision", "no-token", "--optional-path", "optional.ts"], root, assets);
      assert.equal(noToken.ready, true);
      assert.equal(noToken.optional?.reason, "missing-token");
      assert.equal(noToken.entries[0]?.content, "unstaged replacement");
      assert.deepEqual(noToken.skills?.entries.map(skill => skill.id), ["test-execution"]);
      assert.equal(noToken.optional?.entries[0]?.excerpt, "private optional source");
      assert.equal(networkCalls, 0);
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
