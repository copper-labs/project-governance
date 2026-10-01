import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { JevDecisionClient } from "../src/decision-transport.ts";
import { decisionDoctor } from "../src/decision-doctor.ts";
import { contextScopeCoverage } from "../src/context-scope-coverage.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { digest, durableJson } from "../src/core.ts";
import { RELEASE_VERSION } from "../src/release-version.ts";

test("HTTP failures retain safe status and actionable cause without retaining arbitrary provider text", async t => {
  for (const [status, reason] of [[402, "billing-unavailable"], [400, "request-rejected"], [401, "authentication-rejected"],
    [422, "request-rejected"], [429, "provider-overloaded"], [500, "provider-error"]] as const) {
    const root = mkdtempSync(join(tmpdir(), "greenfield-http-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const client = new JevDecisionClient({ token: "private-token-marker", coordinationRoot: root,
      fetch: async () => new Response("private-token-marker arbitrary customer response", { status }) });
    const result = await client.ask("{}", 1000);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, reason);
    assert.equal(result.timing.httpStatus, status);
    assert.ok(!JSON.stringify(result).includes("private-token-marker"));
    assert.ok(!JSON.stringify(result).includes("customer response"));
  }
});

test("a growing unborn project reports its new records and skills outside disclosure scope without changing policy", t => {
  const root = mkdtempSync(join(tmpdir(), "greenfield-coverage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const path of ["docs/guide.md", "projects/example/brief.md", ".agents/skills/planning/SKILL.md", "_local/generated.json", ".env"]) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "Fixture source.\n");
  }
  const profile = { continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"],
    allowed_metadata_paths: ["docs/**"], allowed_source_paths: ["docs/**"], consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } };
  const before = JSON.stringify(profile), narrow = contextScopeCoverage(root, profileDecisionSettings(profile));
  assert.equal(narrow.status, "restricted");
  assert.equal(narrow.eligibleCount, 3);
  assert.equal(narrow.metadataPermittedCount, 1);
  assert.ok(narrow.metadataNotPermittedPreview?.includes("projects/example/brief.md"));
  assert.ok(narrow.metadataNotPermittedPreview?.includes(".agents/skills/planning/SKILL.md"));
  assert.equal(JSON.stringify(profile), before);
  profile.continuity.decisions.allowed_metadata_paths.push("projects/**", ".agents/skills/**");
  profile.continuity.decisions.allowed_source_paths.push("projects/**", ".agents/skills/**");
  assert.equal(contextScopeCoverage(root, profileDecisionSettings(profile)).status, "covered");
});

test("passive health distinguishes unobserved credentials, billing failure, successful inference and a changed configuration", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "greenfield-health-"))), prior = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (prior === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prior; rmSync(root, { recursive: true, force: true }); });
  mkdirSync(join(root, "config/governance"), { recursive: true });
  const profile = { continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["docs/**"],
    consumers: { DL03: { mode: "auto", questions: ["context.relevance/1"] } } } } };
  const file = join(root, "config/governance/profile.yaml");
  writeFileSync(file, JSON.stringify(profile));
  const configDigest = profileDecisionSettings(profile).configDigest;
  const environment = { JEV_TOKEN: "private-token-marker" };
  assert.equal(decisionDoctor(root, environment).operational?.state, "not-observed");
  const record = (name: string, createdAt: string, reason: string, method: string, delivered: boolean, config = configDigest) => {
    durableJson(join(contextStateRoot(root), "decisions", digest(name).slice(7) + ".json"),
      { version: 2, runtimeVersion: RELEASE_VERSION, configDigest: config, receiptId: name, createdAt,
        outcome: { providerCalled: true, scope: { workspace: root }, method, reason, delivered, transport: { httpStatus: reason === "billing-unavailable" ? 402 : 200 } } });
  };
  record("billing", "2026-10-01T10:00:00Z", "billing-unavailable", "baseline", false);
  const failed = decisionDoctor(root, environment);
  assert.equal(failed.status, "needs-attention");
  assert.equal(failed.operational?.state, "failed");
  assert.equal(failed.operational?.httpStatus, 402);
  assert.match(failed.operational?.next ?? "", /credit/);
  record("other-config", "2026-10-01T12:00:00Z", "answered", "jev", true, "unrelated");
  assert.equal(decisionDoctor(root, environment).operational?.state, "failed");
  record("success", "2026-10-01T11:00:00Z", "answered", "jev", true);
  assert.equal(decisionDoctor(root, environment).operational?.state, "succeeded");
  record("shadow", "2026-10-01T13:00:00Z", "shadow", "baseline", false);
  const shadow = decisionDoctor(root, environment);
  assert.equal(shadow.status, "passed");
  assert.equal(shadow.operational?.state, "succeeded");
  assert.equal(shadow.operational?.delivered, false);
  assert.match(shadow.operational?.next ?? "", /shadow/);
  record("interrupted", "2026-10-01T14:00:00Z", "cancelled", "baseline", false);
  assert.equal(decisionDoctor(root, environment).operational?.reason, "shadow");
  assert.ok(!JSON.stringify(decisionDoctor(root, environment)).includes("private-token-marker"));
});
