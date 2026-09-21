import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNaming, namingFindings } from "../src/checkers/naming.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/naming-parity.json", import.meta.url), "utf8"));
test("naming rules match Python fixtures for new names and existing debt", () => {
  for (const entry of fixture.cases) assert.deepEqual(namingFindings(entry.path, entry.isNew, fixture.policy), entry.expected);
});

test("naming waivers require exact rule/path, attribution and unexpired rationale", () => {
  const path = "src/Legacy.ts", candidates = [{ path, isNewOrRenamed: true }];
  const waiver = { rule_id: "naming.forbidden-term", path, owner: "maintainer", expires: "2026-10-01", rationale: "Retained external boundary spelling until the reviewed migration completes." };
  const valid = checkNaming(candidates, fixture.policy, { waivers: [waiver] }, "2026-09-20");
  assert.equal(valid.status, "passed"); assert.equal(valid.findings[0]!.severity, "waived");
  assert.equal(checkNaming(candidates, fixture.policy, { waivers: [{ ...waiver, path: "src/*" }] }, "2026-09-20").status, "failed");
  const expired = checkNaming(candidates, fixture.policy, { waivers: [waiver] }, "2026-10-02");
  assert.ok(expired.findings.some(f => f.rule_id === "naming.waiver-expired"));
  assert.ok(expired.findings.some(f => f.rule_id === "naming.forbidden-term" && f.severity === "blocking"));
  assert.equal(checkNaming(candidates, fixture.policy, { waivers: [{ ...waiver, expires: "2026-02-31" }] }, "2026-09-20").status, "failed");
  assert.equal(checkNaming([{ path, isNewOrRenamed: false }], fixture.policy, { waivers: [] }, "2026-09-20").status, "warning");
});
