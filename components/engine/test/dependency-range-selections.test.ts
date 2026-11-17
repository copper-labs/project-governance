import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkDependencies } from "../src/checkers/dependencies.ts";

const manifestPath = "libraries/example/package.json";
const name = "@publisher/carrier";
const range = "^1.0.0-beta.1";
const registry = "https://packages.example.invalid/sdk/npm/";
const legacy = "https://packages.example.invalid/npm/";
const version = "1.0.0-beta.2.variant";
const resolved = `${registry}${name}/-/carrier-${version}.tgz`;
const archive = Buffer.from("selected archive fixture");
const hash = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const manifest = { name: "@publisher/library", version: "1.0.0", dependencies: { [name]: range } };
const options = { policyPath: "config/policies/dependency-freshness.yaml", evidencePath: "config/policies/dependency-freshness-evidence.yaml",
  overridesPath: "config/policies/dependency-overrides.yaml", asOf: "2026-11-16T20:00:00Z" };

function targetFixture(os: string) {
  const consumer = { name: `consumer-${os}`, version: "1.0.0", dependencies: { [name]: version } };
  const consumerPath = `consumers/${os}/package.json`, lockPath = `consumers/${os}/package-lock.json`;
  const lock = { lockfileVersion: 3, packages: { "": consumer, [`node_modules/${name}`]: { version, resolved, integrity } } };
  const edge = { path: manifestPath, field: "dependencies", name, range };
  const selected = { target: `react-native/${os}`, selection_id: `selection-${os}`, artifact_id: "carrier-variant", version, resolved,
    proof_sha256: hash(`verified selection proof fixture ${os}`), archive_sha256: hash(archive) };
  return {
    consumer, consumerPath, lock, lockPath,
    target: { ...edge, target: selected.target, selection_id: selected.selection_id, artifact_id: selected.artifact_id,
      proof_sha256: selected.proof_sha256, version, origin: registry, archive_sha256: selected.archive_sha256,
      consumer_path: consumerPath, consumer_sha256: hash(json(consumer)) },
    row: {
      edge: { ...edge, manifest_sha256: hash(json(manifest)), expires_at: "2026-11-17" }, selected,
      archive: { sha256: hash(archive), integrity },
      lock: { path: lockPath, sha256: hash(json(lock)), name, version, resolved, integrity },
    },
  };
}
type Row = ReturnType<typeof targetFixture>["row"];

function fixture(input: {
  change?: (row: Row) => void; manifest?: unknown;
  alreadyAuthored?: boolean; noAdmission?: boolean; selfApproval?: boolean; wrongReceiptDigest?: boolean;
  tooYoung?: boolean; noFreshness?: boolean; changedLock?: boolean; multiTarget?: boolean;
  legacyEvidence?: boolean; overrideBase?: string;
  omitTarget?: boolean; duplicateTarget?: boolean; swappedRoot?: boolean;
  supportOnly?: "lock" | "policy" | "registry" | "consumer" | "evidence";
} = {}) {
  const android = targetFixture("android"), ios = targetFixture("ios");
  const expected = input.multiTarget ? [android, ios] : [android];
  const proof = input.multiTarget && !input.omitTarget ? [android.row, input.duplicateTarget ? android.row : ios.row] : [android.row];
  input.change?.(android.row);
  if (input.swappedRoot) {
    android.lock.packages[""] = ios.consumer;
    android.row.lock.sha256 = hash(json(android.lock));
  }
  const receipt = json({ version: 2, selections: proof });
  const policy = { version: 1, owner: "fixture", minimum_age_days: 14, fail_closed_when_unknown: true,
    evidence_path: options.evidencePath, override_max_days: 30, npm_registries: { "@publisher": [legacy, registry] } };
  const approvedPolicy = { ...policy, npm_range_selections_sha256: hash(input.wrongReceiptDigest ? "other receipt" : receipt),
    npm_range_targets: expected.map(item => item.target) };
  const receiptPath = "config/policies/dependency-range-selections.yaml";
  const root = mkdtempSync(join(tmpdir(), "dependency-range-selections-"));
  const write = (path: string, bytes: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const freshness = json({ version: 2, owner: "fixture", records: [{
    ecosystem: "npm", name, version, artifact_type: "direct", evaluated_at: options.asOf,
    published_at: input.tooYoung ? "2026-11-04T00:00:00Z" : "2026-10-01T00:00:00Z",
    source_url: `${input.legacyEvidence ? legacy : registry}${name}/${version}`,
  }] });
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    for (const item of expected) {
      write(item.consumerPath, json(item.consumer));
      write(item.lockPath, json(item.lock));
    }
    write(options.policyPath, json(input.noAdmission || input.selfApproval ? policy : approvedPolicy));
    if (!input.noAdmission && !input.selfApproval) write(receiptPath, receipt);
    if (input.alreadyAuthored || input.supportOnly) write(manifestPath, json(manifest));
    if (!input.noFreshness) write(options.evidencePath, freshness);
    if (input.overrideBase) write(options.overridesPath, json({ version: 2, owner: "fixture", overrides: [{
      ecosystem: "npm", name, version, artifact_type: "direct", source_url: `${input.overrideBase}${name}/${version}`,
      published_at: "2026-11-04", approved_at: "2026-11-16", expires_at: "2026-11-17",
      reason: "fixture", risk_owner: "fixture", approved_by: "fixture operator", approver_role: "operator",
      follow_up: "review fixture", evidence: "reviewed fixture",
    }] }));
    git("add", "."); git("commit", "-qm", "Preserve reviewed range selection authority");
    const base = git("rev-parse", "HEAD");
    const stagedPaths = { lock: android.lockPath, policy: options.policyPath, registry: options.policyPath,
      consumer: android.consumerPath, evidence: options.evidencePath };
    if (input.selfApproval) {
      write(options.policyPath, json(approvedPolicy));
      write(receiptPath, receipt);
    }
    if (!input.supportOnly) write(manifestPath, json(input.manifest ?? manifest));
    if (input.changedLock || input.supportOnly === "lock") write(android.lockPath, json({ ...android.lock, name: "different lock identity" }));
    if (input.supportOnly === "policy") write(options.policyPath, json({ ...approvedPolicy, owner: "next owner" }));
    if (input.supportOnly === "registry") write(options.policyPath, json({ ...approvedPolicy, npm_registries: { "@publisher": [legacy] } }));
    if (input.supportOnly === "consumer") write(android.consumerPath, json({ ...android.consumer, description: "different consumer input" }));
    if (input.supportOnly === "evidence") write(options.evidencePath, json({ version: 2, owner: "fixture", records: [] }));
    git("add", ".");
    const staged = resolveChangeScope(root, { staged: true });
    if (input.supportOnly) assert.deepEqual(staged.records.map(record => record.path), [stagedPaths[input.supportOnly]]);
    // Live files deliberately differ from the staged and committed sources.
    write(manifestPath, json({ ...manifest, dependencies: { [name]: "*" } }));
    write(options.policyPath, json(policy));
    const evaluate = (scope: ReturnType<typeof resolveChangeScope>) => checkDependencies(new ValidationSubject(root, scope), scope, options);
    // A scenario can recheck existing authored bytes via a policy-only update.
    const stagedResult = evaluate(staged);
    git("commit", "--allow-empty", "-qm", "Capture fixture dependency declaration");
    const committed = resolveChangeScope(root, { baseRef: base, candidateRef: git("rev-parse", "HEAD") });
    assert.deepEqual(evaluate(committed), stagedResult);
    return stagedResult;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("an approved range checks its exact first-party coordinate in staged and committed subjects", () => {
  const result = fixture();
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.checked.find(row => row["path"] === manifestPath)?.["changed_dependencies"],
    [{ ecosystem: "npm", name, version, artifact_type: "direct" }]);
  assert.equal(result.checked.find(row => row["path"] === manifestPath)?.["status"], "evidence-verified");
});

const has = (result: ReturnType<typeof fixture>, id: string) => assert.ok(result.findings.some(f => f.rule_id === id), json(result.findings));

test("candidate policy cannot authorize itself and default keeps the manifest finding", () => {
  has(fixture({ selfApproval: true }), "dependency.unsupported-format");
  has(fixture({ noAdmission: true }), "dependency.unsupported-format");
});

test("an approved exact range and field cannot be used for another declaration", () => {
  has(fixture({ change: row => { row.edge.range = "^1.0.0-beta.2"; } }), "dependency.range-evidence-invalid");
  has(fixture({ change: row => { row.edge.field = "devDependencies"; } }), "dependency.range-evidence-invalid");
  has(fixture({ change: row => {
    row.selected.version = row.lock.version = "2.0.0";
    row.selected.resolved = row.lock.resolved = `${registry}${name}/-/carrier-2.0.0.tgz`;
  } }), "dependency.range-evidence-invalid");
});

test("a different platform variant, registry or digest cannot satisfy checked selection", () => {
  for (const change of [
    (row: Row) => { row.selected.artifact_id = "other-variant"; },
    (row: Row) => { row.selected.target = "react-native/ios"; },
    (row: Row) => { row.selected.resolved = row.lock.resolved = resolved.replace("packages.example.invalid", "other.example.invalid"); },
    (row: Row) => { row.archive.sha256 = hash("substituted archive"); },
    (row: Row) => { row.lock.integrity = `sha512-${Buffer.alloc(64).toString("base64")}`; },
  ]) has(fixture({ change }), "dependency.range-evidence-invalid");
  has(fixture({ wrongReceiptDigest: true }), "dependency.range-evidence-invalid");
});

test("expired selection and changed manifest bytes cannot reuse previously admitted declarations", () => {
  has(fixture({ supportOnly: "policy", change: row => { row.edge.expires_at = "2026-11-15"; } }), "dependency.range-evidence-invalid");
  has(fixture({ change: row => { row.edge.expires_at = "2026-11-15"; } }), "dependency.range-evidence-invalid");
  has(fixture({ alreadyAuthored: true, manifest: { ...manifest, description: "new text" } }), "dependency.range-evidence-invalid");
  has(fixture({ changedLock: true }), "dependency.range-evidence-invalid");
});

test("selection proof cannot replace exact age or authoritative freshness evidence", () => {
  has(fixture({ tooYoung: true }), "dependency.evidence-invalid");
  const missing = fixture({ noFreshness: true });
  has(missing, "dependency.evidence-missing");
  assert.equal(missing.findings.some(f => f.rule_id === "dependency.unsupported-format"), false);
});


test("lock-only, consumer-only and policy-only changes recheck unchanged range declarations", () => {
  has(fixture({ supportOnly: "lock" }), "dependency.range-evidence-invalid");
  has(fixture({ supportOnly: "lock", change: row => { row.edge.expires_at = "2026-11-15"; } }), "dependency.range-evidence-invalid");
  has(fixture({ supportOnly: "consumer" }), "dependency.range-evidence-invalid");
  has(fixture({ supportOnly: "registry" }), "dependency.range-evidence-invalid");
  has(fixture({ supportOnly: "evidence" }), "dependency.evidence-missing");
  assert.deepEqual(fixture({ supportOnly: "policy" }).findings, []);
});

test("all independently expected variants need proof for their exact authorized consumers", () => {
  assert.deepEqual(fixture({ multiTarget: true }).findings, []);
  has(fixture({ multiTarget: true, omitTarget: true }), "dependency.range-evidence-invalid");
  has(fixture({ multiTarget: true, duplicateTarget: true }), "dependency.range-evidence-invalid");
  has(fixture({ multiTarget: true, change: row => { row.lock.path = targetFixture("ios").lockPath; } }), "dependency.range-evidence-invalid");
  has(fixture({ swappedRoot: true }), "dependency.range-evidence-invalid");
  has(fixture({ change: row => { row.selected.proof_sha256 = hash("different verified readback"); } }), "dependency.range-evidence-invalid");
  has(fixture({ change: row => { row.selected.resolved = row.lock.resolved = resolved.replace(registry, legacy); } }),
    "dependency.range-evidence-invalid");
});


test("an admitted exact coordinate needs freshness or approval for the same registry base", () => {
  for (const input of [{ legacyEvidence: true }, { noFreshness: true, overrideBase: legacy }]) {
    const result = fixture(input);
    assert.ok(result.findings.some(f => f.rule_id === "dependency.evidence-missing" && String(f.message).includes(registry.slice(0, -1))));
  }
  const sameRoute = fixture({ noFreshness: true, overrideBase: registry });
  assert.deepEqual(sameRoute.findings, []);
  assert.equal(sameRoute.checked.find(row => row["path"] === manifestPath)?.["status"], "operator-override");
});
