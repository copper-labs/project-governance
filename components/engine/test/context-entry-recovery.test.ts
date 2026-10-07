import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promptContext } from "../src/prompt-context.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { presentContextRoute } from "../src/context-route-presentation.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { contextFamilyScope, readDecisionBudget } from "../src/decision-budget.ts";
import { digest } from "../src/core.ts";

const assets = resolve("src/project_governance_runtime/assets/skills");
function fixture(t: TestContext, active = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "entry-recovery-")));
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(join(root, "config/governance"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "state/\n");
  writeFileSync(join(root, "rules.md"), "Required rule: preserve task identity and cleanup.\n");
  writeFileSync(join(root, "parser.ts"), "export const parser='original';\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
  const profile = { profile_id: "fixture", context_router: { default_route: "project", routes: [{ id: "project", primary_context: ["rules.md"] }] },
    continuity: { decisions: { mode: active ? "auto" : "off", allowed_data_classes: ["metadata"], allowed_metadata_paths: ["parser.ts"],
      consumers: { DL03: { mode: active ? "auto" : "off", questions: ["context.metadata-relevance/1"] } } } } };
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
  const event = { hook_event_name: "UserPromptSubmit", session_id: "native", turn_id: "one", cwd: root, prompt: "Find parser behavior" };
  const entryId = () => readdirSync(join(contextStateRoot(root), "prompt-entries"))[0]!.slice(0, -5);
  return { root, event, profile, entryId };
}

test("native output names the replay reference separately from the route receipt; standalone routes have none", async t => {
  const f = fixture(t);
  const output = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const id = f.entryId(), packet = await contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" });
  const shown = presentContextRoute(packet);
  assert.match(id, /^[a-f0-9]{64}$/u); assert.notEqual(shown.receiptId, id);
  assert.deepEqual(shown.nativeEntryReference, { version: 1, kind: "native-prompt-entry", entryId: id, reuses: "original-packet", reuseArguments: ["--entry", id] });
  const text = (output as any).hookSpecificOutput.additionalContext;
  assert.ok(text.includes(`Native entry reference (for --entry): ${id}.`));
  assert.ok(text.includes(`Route receipt (evidence only): ${shown.receiptId}.`));
  const standalone = await contextRouteCommand(["--task", f.event.prompt, "--revision", "r1"], f.root, assets, undefined, { session: "native" });
  assert.equal(presentContextRoute(standalone).nativeEntryReference, null);
});

test("edited source gives an exact same-turn recovery, preserving paid budget, original packet and host isolation", async t => {
  const f = fixture(t, true), previousFetch = globalThis.fetch, previousToken = process.env.JEV_TOKEN;
  let calls = 0;
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    calls++; const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions)
      .map(key => [key, { type: "noul", noul: 0.9 }])) });
  };
  globalThis.fetch = fetch; process.env.JEV_TOKEN = "fixture";
  t.after(() => { globalThis.fetch = previousFetch; if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken; });
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const id = f.entryId(), state = contextStateRoot(f.root), scope = contextFamilyScope(f.root, id);
  const entryPath = join(state, "prompt-entries", `${id}.json`), packetPath = join(state, "prompt-packets", `${id}.json`);
  const originalEntry = readFileSync(entryPath), originalPacket = readFileSync(packetPath);
  const budget = readDecisionBudget(state, scope)!;
  assert.ok(calls > 0 && budget.calls > 0);
  const before = calls;
  writeFileSync(join(f.root, "parser.ts"), "export const parser='changed';\n");
  let failure: ContextRouteError | undefined;
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError); failure = error;
    assert.equal(error.code, "entry-source-stale");
    assert.equal(error.diagnostic?.causeCode, "source-changed");
    assert.equal(error.diagnostic?.sourceKind, "optional");
    assert.equal(error.diagnostic?.sourcePathDigest, digest("parser.ts"));
    const receipt = JSON.parse(readFileSync(error.receiptPath!, "utf8"));
    assert.equal(receipt.providerCalled, false); assert.equal(receipt.providerUsage, "not-called");
    assert.ok(!JSON.stringify(receipt).includes("parser.ts") && !JSON.stringify(receipt).includes("export const"));
    return true;
  });
  assert.equal(calls, before); assert.deepEqual(readDecisionBudget(state, scope), budget);
  const recovery = failure!.recovery!;
  assert.equal(recovery.action, "refresh-current-entry"); assert.equal(recovery.entryId, id); assert.equal(recovery.sharedAllowance, true);
  assert.deepEqual(recovery.requires, ["task"]);
  await assert.rejects(contextRouteCommand(recovery.arguments, f.root, assets, undefined, { session: "native" }));
  assert.equal(calls, before); assert.deepEqual(readDecisionBudget(state, scope), budget, "Incomplete instructions cannot occupy a paid expansion slot");
  const args = [...recovery.arguments, "--task", f.event.prompt];
  await assert.rejects(contextRouteCommand(args, f.root, assets, undefined, { session: "different-chat" }), /current observed entry/);
  assert.equal(calls, before);
  const refreshed = await contextRouteCommand(args, f.root, assets, undefined, { session: "native" });
  assert.equal(refreshed.execution.entryId, id); assert.equal(refreshed.expansion?.sharedAllowance, true);
  assert.equal(refreshed.expansion?.step, 1); assert.equal(refreshed.expansion?.completed, true);
  assert.match(refreshed.optional!.entries.find(item => item.id === "parser.ts")!.excerpt, /changed/);
  assert.ok(readDecisionBudget(state, scope)!.calls >= budget.calls, "Refresh retains spending even when unchanged metadata answers can be cached");
  const after = calls;
  const duplicate = await contextRouteCommand(args, f.root, assets, undefined, { session: "native" });
  assert.equal(duplicate.expansion?.status, "duplicate"); assert.equal(calls, after);
  assert.equal(presentContextRoute(refreshed).nativeEntryReference!.reuses, "original-packet");
  const final = await contextRouteCommand(["--entry", id, "--expansion", "2", "--task", "Inspect changed parser cleanup"], f.root, assets, undefined, { session: "native" });
  assert.equal(final.expansion?.completed, true);
  const closedBudget = readDecisionBudget(state, scope), closedCalls = calls;
  writeFileSync(join(f.root, "parser.ts"), "export const parser='changed again';\n");
  let exhausted: ContextRouteError | undefined;
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError); exhausted = error; return true;
  });
  assert.match(exhausted!.message, /may fall back locally/);
  const local = await contextRouteCommand([...exhausted!.recovery!.arguments, "--task", "Inspect parser again"], f.root, assets, undefined, { session: "native" });
  assert.equal(local.ready, true); assert.equal(local.metadata, null, "Closed continuation still refreshes local evidence, without paid selection");
  assert.equal(calls, closedCalls); assert.deepEqual(readDecisionBudget(state, scope), closedBudget);
  assert.match(local.optional!.entries.find(item => item.id === "parser.ts")!.excerpt, /changed again/);
  assert.deepEqual(readFileSync(entryPath), originalEntry); assert.deepEqual(readFileSync(packetPath), originalPacket);
  await promptContext("codex", { ...f.event, turn_id: "two" }, f.root, { environment: {}, assetRoot: assets });
  await assert.rejects(contextRouteCommand(args, f.root, assets, undefined, { session: "native" }), /current observed entry/);
});

test("retained receipt corruption gets no source-refresh advice, and delegated replay grants no expansion", async t => {
  const f = fixture(t), previous = process.env.HARNESS_AGENT_ANCESTRY;
  t.after(() => { if (previous === undefined) delete process.env.HARNESS_AGENT_ANCESTRY; else process.env.HARNESS_AGENT_ANCESTRY = previous; });
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const id = f.entryId(), packet = JSON.parse(readFileSync(join(contextStateRoot(f.root), "prompt-packets", `${id}.json`), "utf8"));
  writeFileSync(join(f.root, "parser.ts"), "export const parser='changed';\n");
  process.env.HARNESS_AGENT_ANCESTRY = "delegated-fixture";
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError); assert.equal(error.code, "entry-source-stale");
    assert.equal(error.recovery, undefined); return true;
  });
  if (previous === undefined) delete process.env.HARNESS_AGENT_ANCESTRY; else process.env.HARNESS_AGENT_ANCESTRY = previous;
  writeFileSync(packet.validation.receipt, '{"private":"corrupt retained receipt"}');
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError); assert.equal(error.code, "entry-packet-invalid");
    assert.equal(error.diagnostic?.causeCode, "receipt-digest-changed"); assert.equal(error.recovery, undefined);
    assert.ok(!JSON.stringify(JSON.parse(readFileSync(error.receiptPath!, "utf8"))).includes("corrupt retained receipt")); return true;
  });
});

test("routing policy and required guidance drift have separate safe causes", async t => {
  const f = fixture(t);
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const id = f.entryId();
  writeFileSync(join(f.root, "rules.md"), "Changed private required guidance.\n");
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError);
    assert.equal(error.diagnostic?.sourceKind, "required"); assert.equal(error.diagnostic?.causeCode, "source-changed");
    assert.equal(error.diagnostic?.sourcePathDigest, digest("rules.md")); return true;
  });
  writeFileSync(join(f.root, "config/governance/profile.yaml"), JSON.stringify({ ...f.profile, profile_id: "changed" }));
  await assert.rejects(contextRouteCommand(["--entry", id], f.root, assets, undefined, { session: "native" }), (error: unknown) => {
    assert.ok(error instanceof ContextRouteError);
    assert.equal(error.diagnostic?.sourceKind, "configuration"); assert.equal(error.diagnostic?.causeCode, "configuration-changed");
    assert.equal(error.diagnostic?.sourcePathDigest, digest("config/governance/profile.yaml")); return true;
  });
});
