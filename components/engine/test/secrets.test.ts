import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { scanSecretChunks, secretFindings, secretWaivers, secretResult } from "../src/checkers/secrets.ts";

const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/secret-waivers.schema.json", import.meta.url), "utf8"));

test("secret signatures are detected across chunk boundaries and arbitrary binary input", async () => {
  const bytes = Buffer.concat([Buffer.from([0xff]), Buffer.from("ghp_" + "A".repeat(36) + "\nAWS_SECRET_ACCESS_KEY = '" + "b".repeat(40) + "'\n" + "-----BEGIN " + "RSA PRIVATE KEY-----")]);
  const chunks = [...bytes].map(value => Buffer.from([value]));
  const result = await scanSecretChunks(chunks);
  assert.deepEqual(result.detectorIds, ["aws-secret-access-key", "github-token", "private-key"]);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual((await scanSecretChunks([Buffer.from("ordinary source")])).detectorIds, []);
});

test("exact waiver cannot suppress a different secret-bearing worktree or index image", async () => {
  const original = await scanSecretChunks([Buffer.from("ghp_" + "A".repeat(36))]);
  const changed = await scanSecretChunks([Buffer.from("ghp_" + "B".repeat(36))]);
  const waiver = { path: "config.txt", detector_id: "github-token", after_image_sha256: original.sha256,
    owner: "maintainer", rationale: "Synthetic detector contract fixture retained for regression coverage.", expires: "2026-10-01" };
  assert.equal(secretFindings([{ path: "config.txt", scan: original }], [waiver])[0]!.severity, "suppressed");
  const findings = secretFindings([{ path: "config.txt", scan: original }, { path: "config.txt", scan: changed }], [waiver]);
  assert.equal(findings.length, 1); assert.equal(findings[0]!.severity, "blocking");
  assert.ok(!JSON.stringify(findings).includes("A".repeat(36)), "reports do not contain detected credentials");
  assert.equal(secretResult([], [], [{ rule_id: "security.scan-unavailable", severity: "blocking", message: "cannot read source" }]).status, "failed");
});

test("secret registry uses the shipped schema and rejects broad, expired or impossible-date waivers", () => {
  const waiver = { path: "config.txt", detector_id: "github-token", after_image_sha256: "a".repeat(64), owner: "maintainer", rationale: "Synthetic fixture needed for deterministic regression tests.", expires: "2026-10-01" };
  const registry = (overrides: Record<string, unknown>) => ({ version: 1, owner: "team", waivers: [{ ...waiver, ...overrides }] });
  assert.equal(secretWaivers(registry({}), schema, "2026-09-20").waivers.length, 1);
  assert.equal(secretWaivers(registry({ path: "*" }), schema, "2026-09-20").waivers.length, 0);
  assert.equal(secretWaivers(registry({ expires: "2026-02-31" }), schema, "2026-09-20").findings[0]!.rule_id, "security.waiver-registry-invalid");
  assert.equal(secretWaivers(registry({}), schema, "2026-10-02").findings[0]!.rule_id, "security.waiver-expired");
  assert.equal(secretWaivers(registry({ extra: "not permitted" }), schema, "2026-09-20").waivers.length, 0);
});
