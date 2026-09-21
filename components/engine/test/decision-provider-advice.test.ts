import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, durableJson, fileDigest } from "../src/core.ts";
import { providerJobCommand } from "../src/provider-job-command.ts";

test("provider status delivers bounded output and claim advice without changing native evidence", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-advice-")));
  const oldState = process.env.XDG_STATE_HOME, oldToken = process.env.JEV_TOKEN, oldFetch = globalThis.fetch;
  t.after(() => {
    if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState;
    if (oldToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = oldToken;
    globalThis.fetch = oldFetch; rmSync(root, { recursive: true, force: true });
  });
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "test-only";
  mkdirSync(join(root, "config/governance"), { recursive: true });
  durableJson(join(root, "config/governance/profile.yaml"), { continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"],
    consumers: { DL09: { mode: "auto" }, DL13: { mode: "auto" } } } } });
  const directory = join(root, "job"); mkdirSync(directory);
  const request = { version: 1, id: "job", operation: { cwd: root }, provider: { kind: "claude" }, assignment: { task: "Inspect the completed work" }, runtime: {} };
  const requestDigest = digest(request);
  durableJson(join(directory, "request.json"), request);
  const originalAnswer = "Result header\n\nRoutine progress chatter\n\nWarning: missing device proof\n  details remain important\n\nFinal result";
  const providerPath = join(directory, "provider-result.json");
  durableJson(providerPath, { version: 1, requestDigest, state: "succeeded", identity: null,
    completion: { outcome: "completed", answer: originalAnswer, artifacts: [], sources: [], remaining: [],
      checks: [{ description: "All platforms passed", result: "passed", evidence: "Only a simulator result was supplied" }] } });
  durableJson(join(directory, "result.json"), { version: 1, requestDigest, state: "succeeded", exitCode: 0, signal: null, reason: "completed", cleanup: "confirmed",
    startedAt: "2026-09-21T00:00:00Z", endedAt: "2026-09-21T00:00:01Z", durationMs: 1000, log: join(directory, "output.log"), logBytes: 0,
    providerResult: providerPath, providerResultDigest: fileDigest(providerPath) });
  const original = readFileSync(providerPath), receipt = readFileSync(join(directory, "result.json"));
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 100, output_tokens: 10 }, answers: Object.fromEntries(
      Object.entries(payload.questions).map(([name, raw]) => {
        const question = raw as { type: string; criteria?: Record<string, unknown> };
        if (question.type === "noul") return [name, { type: "noul", noul: 0.1 }];
        const choice = name === "scope" ? "broader-than-evidence" : "insufficient";
        return [name, { type: "choice", choice, confidence: 0.8,
          probabilities: Object.fromEntries(Object.keys(question.criteria!).map(id => [id, id === choice ? 0.9 : id === "unknown" ? 0.1 : 0])) }];
      })) });
  };
  const args = ["--directory", directory, "--digest", requestDigest];
  const first = await providerJobCommand("provider-status", args);
  const value = first.result as any;
  assert.equal(first.exitCode, 0);
  assert.equal(value.provider.completion.answer.includes("Routine progress chatter"), false);
  assert.equal(value.provider.completion.answer.includes("Warning: missing device proof"), true);
  assert.equal(value.decisionAdvice.output.omitted.length, 1);
  const omitted = value.decisionAdvice.output.omitted[0];
  assert.equal(omitted.within, "completion.answer");
  assert.equal(originalAnswer.split("\n").slice(omitted.firstLine - 1, omitted.lastLine).join("\n"), "Routine progress chatter");
  assert.equal(value.decisionAdvice.claims.evidenceBasis, "reported-only");
  assert.equal(value.decisionAdvice.claims.scope.label, "broader-than-evidence");
  assert.equal(value.decisionAdvice.claims.corrections[0].label, "insufficient");
  assert.equal(calls, 2);
  assert.deepEqual(readFileSync(providerPath), original);
  assert.deepEqual(readFileSync(join(directory, "result.json")), receipt);
  const repeat = await providerJobCommand("provider-wait", [...args, "--milliseconds", "0"]);
  assert.equal(repeat.exitCode, 0); assert.equal(calls, 2);
  const nativeDirectory = join(root, "native-check"); mkdirSync(nativeDirectory);
  const nativeRequest = { version: 1, id: "native-check", operation: { cwd: root, env: {}, argv: [process.execPath, "--version"] }, deadlineMs: 1000, outputLimit: 1000, ownerDigest: `sha256:${"a".repeat(64)}` };
  durableJson(join(nativeDirectory, "request.json"), nativeRequest);
  durableJson(join(nativeDirectory, "owner.json"), { requestDigest: digest(nativeRequest), pid: 12345, fingerprint: "fixture captured process" });
  const nativeLog = join(nativeDirectory, "output.log"); writeFileSync(nativeLog, "Only a simulator result was supplied");
  durableJson(join(nativeDirectory, "result.json"), { version: 1, requestDigest: digest(nativeRequest), state: "succeeded", exitCode: 0, cleanup: "confirmed",
    endedAt: "2026-09-21T00:00:00.500Z", log: nativeLog });
  const evidencePath = join(root, "claim-evidence.json");
  const claim = { description: "All platforms passed", result: "passed", evidence: "Only a simulator result was supplied" };
  durableJson(evidencePath, { version: 1, providerRequestDigest: requestDigest, providerResultDigest: fileDigest(providerPath),
    claims: [{ claimIndex: 0, claimDigest: digest(claim), quote: claim.evidence, directory: nativeDirectory,
      requestDigest: digest(nativeRequest), resultDigest: fileDigest(join(nativeDirectory, "result.json")) }] });
  const bound = await providerJobCommand("provider-status", [...args, "--claim-evidence", evidencePath]);
  assert.equal((bound.result as any).decisionAdvice.claims.evidenceBasis, "file-consistent");
  assert.equal((bound.result as any).decisionAdvice.claims.scope.label, "broader-than-evidence");
  assert.equal(calls, 3);
  // Known native failures need no model judgment, including when the token is absent.
  delete process.env.JEV_TOKEN;
  durableJson(join(nativeDirectory, "result.json"), { version: 1, requestDigest: digest(nativeRequest), state: "failed", exitCode: 1, cleanup: "unknown",
    endedAt: "2026-09-21T00:00:00.500Z", log: nativeLog });
  durableJson(evidencePath, { version: 1, providerRequestDigest: requestDigest, providerResultDigest: fileDigest(providerPath),
    claims: [{ claimIndex: 0, claimDigest: digest(claim), quote: claim.evidence, directory: nativeDirectory,
      requestDigest: digest(nativeRequest), resultDigest: fileDigest(join(nativeDirectory, "result.json")) }] });
  const failed = await providerJobCommand("provider-status", [...args, "--claim-evidence", evidencePath]);
  const failureAdvice = (failed.result as any).decisionAdvice.claims;
  assert.equal(failureAdvice.corrections[0].label, "native-result-not-passed");
  assert.equal(failureAdvice.boundEvidence[0].directory, nativeDirectory);
  assert.equal(failureAdvice.decision.delivered, false);
  assert.equal(calls, 3);
  rmSync(join(nativeDirectory, "owner.json"));
  const unowned = await providerJobCommand("provider-status", [...args, "--claim-evidence", evidencePath]);
  assert.equal((unowned.result as any).decisionAdvice.claimEvidence.status, "invalid");
  writeFileSync(nativeLog, "different native evidence");
  const invalid = await providerJobCommand("provider-status", [...args, "--claim-evidence", evidencePath]);
  assert.equal((invalid.result as any).decisionAdvice.claimEvidence.status, "invalid");
  assert.equal(calls, 3);
  writeFileSync(providerPath, "changed after capture");
  await assert.rejects(providerJobCommand("provider-status", args), /identity mismatch/);
  assert.equal(calls, 3);
});


test("claim disclosure does not depend on success spelling and partial bindings stay mixed", async () => {
  const { claimAdvice } = await import("../src/decision-claim-advice.ts");
  const runtime = { eligibility: () => ({ mode: "off", effect: "advise", reasons: ["consumer-off"] }) } as any;
  const evidence = { claimIndex: 0, claimDigest: "fixture", requestDigest: "fixture", resultDigest: "fixture",
    quote: "failed", state: "failed", exitCode: 1, cleanup: "unknown", subjectDigest: null, endedAt: "fixture", directory: "/fixture" };
  const receipt = { state: "succeeded", exitCode: 0, cleanup: "confirmed" } as any;
  for (const result of ["PASS", "pass", "ok", "✅", "passed"]) {
    const check = { description: "Test passed", result, evidence: "failed" };
    const summary = { completion: { outcome: "completed", checks: Array(5).fill(check), remaining: [] } } as any;
    const advice = await claimAdvice(runtime, receipt, summary, null, { eventId: "event", policyDigest: "policy", environment: "fixture", revision: "1",
      boundEvidence: [0, 1, 2, 3].map(claimIndex => ({ ...evidence, claimIndex })) });
    assert.equal(advice.evidenceBasis, "mixed");
    assert.equal(advice.corrections.length, 4);
    assert.equal(advice.decision, null);
  }
});

test("honest partial and blocked reports require no inference or extra work", async () => {
  const { claimAdvice } = await import("../src/decision-claim-advice.ts");
  const runtime = { eligibility: () => ({ mode: "auto", effect: "advise", reasons: [] }),
    ask: () => { throw new Error("Honest partial reports must not dispatch inference"); } } as any;
  for (const outcome of ["partial", "blocked"]) {
    const receipt = { state: "failed", exitCode: 1, cleanup: "unknown" } as any;
    const summary = { completion: { outcome, checks: [{ description: "Build", result: "blocked", evidence: "Missing prerequisite" }], remaining: ["Build needs prerequisite"] } } as any;
    const advice = await claimAdvice(runtime, receipt, summary, null, { eventId: "partial", policyDigest: "policy", environment: "fixture", revision: "1" });
    assert.equal(advice.reason, "honest-partial-report");
    assert.deepEqual(advice.corrections, []); assert.equal(advice.decision, null);
    assert.equal(advice.nativeFacts.cleanup, "unknown");
    assert.deepEqual(advice.nativeFacts.remaining, ["Build needs prerequisite"]);
  }
});

test("supported narrow completion advice introduces no correction or acceptance claim", async t => {
  const { claimAdvice } = await import("../src/decision-claim-advice.ts");
  const { DecisionRuntime } = await import("../src/decision-runtime.ts");
  const { profileDecisionSettings } = await import("../src/decision-settings.ts");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "supported-claim-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL09: { mode: "auto" } } } } });
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(payload.questions).map(([name, question]) => {
      const choice = name === "scope" ? "within-evidence" : "supported", keys = Object.keys((question as any).criteria);
      return [name, { type: "choice", choice, confidence: 0.95, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) }];
    })) });
  } });
  const receipt = { state: "succeeded", exitCode: 0, cleanup: "confirmed", requestDigest: digest("request"), signal: null, reason: "completed", durationMs: 1, logBytes: 0 } as any;
  const summary = { completion: { outcome: "completed", answer: "The named unit test passed", checks: [{ description: "Named unit test", result: "passed", evidence: "One unit test passed" }], remaining: [], artifacts: [], sources: [] } } as any;
  const advice = await claimAdvice(runtime, receipt, summary, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId: "supported", policyDigest: "policy", environment: "fixture", revision: "1" });
  assert.equal(advice.delivered, true); assert.deepEqual(advice.corrections, []); assert.equal(advice.correction, null);
  assert.equal(advice.evidenceBasis, "reported-only"); assert.equal(advice.scope, null);
  assert.match(advice.authority, /deterministic acceptance is unchanged/);
});
