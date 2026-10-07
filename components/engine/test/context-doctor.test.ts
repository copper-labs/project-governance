import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contextDoctor } from "../src/context-doctor.ts";
import { runtimeDoctor } from "../src/runtime-doctor.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { startupHooks } from "../src/startup-hooks.ts";
import { parse } from "yaml";

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-doctor-"))), environment = { ...process.env }, transport = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "unwritten-state"); delete process.env.JEV_TOKEN;
  delete process.env.HARNESS_SESSION; delete process.env.GOVERNANCE_SESSION;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Readiness must not probe the provider"); };
  mkdirSync(join(root, "config/governance"), { recursive: true });
  mkdirSync(join(root, "docs")); writeFileSync(join(root, "docs/rules.md"), "Required synthetic project guidance.\n");
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src/local.ts"), "export const syntheticLocalOnly = true;\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  const profile = parse(PROJECT_DEFAULTS["config/governance/profile.yaml"]!);
  profile.context_router.routes[0].primary_context = ["docs/rules.md"];
  const profilePath = join(root, "config/governance/profile.yaml");
  const save = () => writeFileSync(profilePath, JSON.stringify(profile)); save();
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(join(root, ".codex"));
  writeFileSync(join(root, ".codex/hooks.json"), startupHooks({}, root, join(root, ".governance/runtime/startup.sqlite")).content);
  mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
  writeFileSync(join(root, ".governance/runtime/bin/project-governance"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const enable = (passages = false) => {
    profile.continuity = { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"],
      allowed_metadata_paths: ["docs/**"], allowed_source_paths: ["docs/**"], consumers: { DL03: { mode: "auto", questions:
        ["context.metadata-relevance/1", ...(passages ? ["context.passage-evidence/1", "context.passage-role/1"] : [])] } } } };
    save();
  };
  return { root, profile, profilePath, save, enable, calls: () => calls,
    cleanup() { process.env = environment; globalThis.fetch = transport; rmSync(root, { recursive: true, force: true }); } };
}

test("an intentionally off greenfield profile is ready without credentials or a provider probe", () => {
  const f = fixture();
  try {
    const before = readFileSync(f.profilePath), result = contextDoctor(f.root);
    assert.equal(result.readiness.status, "ready"); assert.equal(result.readiness.selection, "off");
    assert.equal(result.readiness.provider, "not-requested"); assert.equal(result.readiness.sharing, "not-requested");
    assert.ok(!result.findings.some(finding => finding.id === "context.credentials-missing"));
    assert.equal(result.readiness.providerAvailability, "not-probed"); assert.equal(result.readiness.hostConsumption, "not-observed");
    assert.equal(f.calls(), 0); assert.deepEqual(readFileSync(f.profilePath), before);
    assert.equal(existsSync(join(f.root, "unwritten-state")), false);
    assert.deepEqual(readdirSync(join(f.root, ".governance/runtime")), ["bin"]);
  } finally { f.cleanup(); }
});

test("requested JEV without a host token is visibly degraded while local fallback remains available", () => {
  const f = fixture();
  try {
    f.enable(); const result = contextDoctor(f.root);
    assert.equal(result.readiness.selection, "metadata-only"); assert.equal(result.readiness.status, "degraded");
    assert.equal(result.readiness.provider, "disabled"); assert.ok(result.readiness.issues.includes("context.credentials-missing"));
    assert.match(result.readiness.next, /JEV_TOKEN.*absent.*Local fallback/);
    const doctor = runtimeDoctor(f.root, join(f.root, "missing.sqlite"));
    assert.deepEqual(doctor.contextReadiness, doctor.context.readiness);
    assert.equal(doctor.contextReadiness.status, "degraded");
    assert.equal(result.localRetrieval, "provider-independent"); assert.equal(f.calls(), 0);
    assert.equal(existsSync(join(f.root, "missing.sqlite")), false);
  } finally { f.cleanup(); }
});

test("metadata-only and passage readiness describe approved capability without claiming live use", () => {
  const f = fixture();
  try {
    process.env.JEV_TOKEN = "synthetic-readiness-only";
    f.enable(); const metadata = contextDoctor(f.root);
    assert.equal(metadata.readiness.status, "ready"); assert.equal(metadata.readiness.selection, "metadata-only");
    assert.equal(metadata.readiness.provider, "eligible-unproven"); assert.equal(metadata.readiness.sharing, "restricted");
    assert.ok(metadata.findings.some(finding => finding.id === "context.passage-not-enabled"));
    assert.ok(!metadata.readiness.issues.includes("context.passage-not-enabled"));
    f.enable(true); const passages = contextDoctor(f.root);
    assert.equal(passages.readiness.status, "ready"); assert.equal(passages.readiness.selection, "passages");
    assert.equal(passages.readiness.providerAvailability, "not-probed");
    assert.ok(!JSON.stringify(passages).includes("synthetic-readiness-only"));
    assert.equal(f.calls(), 0);
  } finally { f.cleanup(); }
});

test("missing question, missing source approval and hook drift remain separate setup findings", () => {
  const f = fixture();
  try {
    process.env.JEV_TOKEN = "synthetic-readiness-only"; f.enable(true);
    f.profile.continuity.decisions.allowed_source_paths = []; f.save();
    const restricted = contextDoctor(f.root);
    assert.equal(restricted.readiness.selection, "metadata-only"); assert.equal(restricted.readiness.status, "degraded");
    assert.ok(restricted.readiness.issues.includes("context.passage-not-approved"));
    f.profile.continuity.decisions.consumers.DL03.questions = []; f.save();
    const questions = contextDoctor(f.root);
    assert.equal(questions.readiness.selection, "not-configured"); assert.equal(questions.readiness.provider, "disabled");
    assert.ok(questions.readiness.issues.includes("context.metadata-question-not-enabled"));
    f.enable(); f.profile.continuity.decisions.allowed_metadata_paths = []; f.save();
    const unapproved = contextDoctor(f.root);
    assert.equal(unapproved.readiness.selection, "not-configured"); assert.equal(unapproved.readiness.provider, "disabled");
    assert.ok(unapproved.readiness.issues.includes("context.metadata-not-approved"));
    f.profile.continuity.decisions.mode = "off"; f.save();
    assert.equal(contextDoctor(f.root).readiness.status, "ready");
    rmSync(join(f.root, ".codex/hooks.json")); const hooks = contextDoctor(f.root);
    assert.equal(hooks.readiness.selection, "off"); assert.equal(hooks.readiness.status, "degraded");
    assert.ok(hooks.readiness.issues.includes("context.prompt-hook-unavailable"));
    assert.equal(f.calls(), 0);
  } finally { f.cleanup(); }
});

test("invalid profile and oversized mandatory guidance never report selection readiness", () => {
  const f = fixture();
  try {
    writeFileSync(f.profilePath, "continuity: [invalid\n");
    const invalid = contextDoctor(f.root);
    assert.equal(invalid.readiness.status, "unavailable"); assert.equal(invalid.readiness.mode, null);
    assert.equal(invalid.readiness.provider, "unknown");
    f.save(); writeFileSync(join(f.root, "docs/rules.md"), "R".repeat(100000));
    const oversized = contextDoctor(f.root);
    assert.equal(oversized.readiness.selection, "off"); assert.equal(oversized.readiness.status, "degraded");
    assert.ok(oversized.readiness.issues.includes("context.required-too-large")); assert.equal(f.calls(), 0);
  } finally { f.cleanup(); }
});
