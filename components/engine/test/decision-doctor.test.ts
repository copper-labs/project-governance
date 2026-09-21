import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decisionDoctor } from "../src/decision-doctor.ts";

test("decision doctor reports optional fallback and eligibility without network or secret output", () => {
  const root = mkdtempSync(join(tmpdir(), "decision-doctor-"));
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Doctor must not call a provider"); };
  try {
    const absent = decisionDoctor(root, {});
    assert.equal(absent.status, "passed"); assert.equal(absent.providerUse, "disabled");
    assert.equal(absent.mode, "off"); assert.deepEqual(readdirSync(root), []);
    mkdirSync(join(root, "config/governance"), { recursive: true });
    const profile = join(root, "config/governance/profile.yaml");
    writeFileSync(profile, "continuity:\n  decisions:\n    mode: shadow\n    allowed_questions: [rank_optional_context]\n    allowed_data_classes: [source]\n");
    const restricted = decisionDoctor(root, { JEV_TOKEN: "secret-value" });
    assert.equal(restricted.providerUse, "disabled"); assert.ok(restricted.reasons?.includes("source-scope-disabled"));
    writeFileSync(profile, "continuity:\n  decisions:\n    mode: auto\n    allowed_questions: [rank_optional_context]\n    allowed_data_classes: [source]\n    allowed_source_paths: ['src/**']\n");
    const missing = decisionDoctor(root, {});
    assert.deepEqual(missing.reasons, ["missing-token"]);
    const eligible = decisionDoctor(root, { JEV_TOKEN: "secret-value" });
    assert.equal(eligible.providerUse, "eligible"); assert.equal(eligible.providerHealth, "not-probed");
    assert.equal(JSON.stringify(eligible).includes("secret-value"), false);
    writeFileSync(profile, "continuity:\n  decisions:\n    mode: unknown\n");
    const invalid = decisionDoctor(root, {});
    assert.equal(invalid.status, "failed"); assert.equal(invalid.providerUse, "invalid-configuration");
  } finally { globalThis.fetch = priorFetch; rmSync(root, { recursive: true, force: true }); }
});
