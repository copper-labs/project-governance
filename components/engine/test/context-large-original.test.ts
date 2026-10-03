import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { digest } from "../src/core.ts";

test("a selected original above 1 MiB yields bounded evidence and retains whole-source freshness", async () => {
  const root = mkdtempSync(join(tmpdir(), "large-original-")), state = mkdtempSync(join(tmpdir(), "large-original-state-"));
  const previous = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = state;
  const assets = resolve("src/project_governance_runtime/assets/skills");
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true });
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "default", routes: [{ id: "default", primary_context: ["rules.md"] }] } }));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ facts: {} }));
    writeFileSync(join(root, "rules.md"), "Preserve required policy.\n");
    const source = "/*" + " ".repeat(1_100_000) + "*/\nexport function recoverLaunch() { return 'running'; }\n";
    writeFileSync(join(root, "launch.ts"), source); git("add", "config", "rules.md", "launch.ts");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "large fixture");
    let calls = 0, mutate = false;
    const provider = { async decide(request: any) {
      calls++; assert.equal(request.candidates.find((item: any) => item.id === "launch.ts")?.excerpt, source);
      if (mutate) writeFileSync(join(root, "launch.ts"), source + "// changed outside selected evidence\n");
      return { version: 1 as const, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map((item: any) => item.id),
        suggested: null, method: "baseline" as const, reason: "fixture", model: null, questionVersion: "1", confidence: null,
        latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
    } };
    const args = ["--task", "recover launch running", "--revision", "large", "--optional-path", "launch.ts"];
    const packet = await contextRouteCommand(args, root, assets, provider);
    assert.equal(packet.ready, true); assert.equal(calls, 1);
    assert.equal(packet.entries[0]?.content, "Preserve required policy.\n");
    const evidence = packet.optional?.entries.find(item => item.id === "launch.ts");
    assert.ok(evidence); assert.match(evidence.excerpt, /recoverLaunch/); assert.ok(Buffer.byteLength(evidence.excerpt) <= 2048);
    assert.ok(evidence.sourceRange, "A large source must be a labelled excerpt, not an apparent whole original");
    mutate = true;
    await assert.rejects(contextRouteCommand(args, root, assets, provider), error => (error as any).code === "stale-source");
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true }); rmSync(state, { recursive: true, force: true });
  }
});
