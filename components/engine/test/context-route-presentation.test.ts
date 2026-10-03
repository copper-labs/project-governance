import { test } from "node:test";
import assert from "node:assert/strict";
import { contextSelectionStatus } from "../src/context-route-presentation.ts";
import type { RoutedContextPacket } from "../src/context-route-command.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { presentContextRoute } from "../src/context-route-presentation.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const packet = (fields: Record<string, unknown>) => ({ ready: true, selection: { reason: "not-attempted" }, ...fields }) as RoutedContextPacket;

test("ready baseline context names the unavailable semantic selection without claiming JEV use", () => {
  for (const reason of ["budget-store-capacity", "budget-unavailable", "missing-token", "billing-unavailable", "off", "metadata-question-disabled"]) {
    const status = contextSelectionStatus(packet({ metadata: { reason, coverage: { answeredCount: 0, permittedCount: 8447, complete: false, applied: false } } }));
    assert.equal(status.delivery, "ready"); assert.equal(status.mode, "local"); assert.equal(status.coverage, "none");
    assert.equal(status.applied, false); assert.equal(status.reason, reason);
    assert.match(status.summary, /local fallback/); assert.ok(status.summary.includes(reason));
  }
});

test("partial, full, negative-only and shadow assessments remain distinct from packet delivery", () => {
  const metadata = { reason: "budget-exhausted", coverage: { answeredCount: 63, permittedCount: 500, complete: false, applied: true, mode: "auto" } };
  const partial = contextSelectionStatus(packet({ metadata }));
  assert.equal(partial.mode, "jev"); assert.equal(partial.coverage, "partial"); assert.match(partial.summary, /63\/500/);
  assert.match(partial.summary, /remaining items use local fallback/);
  const complete = contextSelectionStatus(packet({ metadata: { reason: "answered", coverage: { ...metadata.coverage, answeredCount: 500, complete: true } } }));
  assert.equal(complete.mode, "jev"); assert.equal(complete.coverage, "complete"); assert.equal(complete.applied, true);
  const negative = contextSelectionStatus(packet({ metadata: { reason: "answered", coverage: { ...metadata.coverage, answeredCount: 500, complete: true, applied: false } } }));
  assert.equal(negative.mode, "jev"); assert.equal(negative.applied, false, "Valid answers need not change local ordering");
  const shadow = contextSelectionStatus(packet({ metadata: { reason: "shadow", coverage: { ...metadata.coverage, mode: "shadow", applied: false } } }));
  assert.equal(shadow.mode, "shadow"); assert.equal(shadow.applied, false); assert.match(shadow.summary, /results were not applied/);
  const blocked = contextSelectionStatus(packet({ ready: false, metadata: null }));
  assert.equal(blocked.delivery, "blocked"); assert.match(blocked.summary, /delivery is blocked/);
});

test("legacy advice does not pretend to have complete index coverage", () => {
  const status = contextSelectionStatus(packet({ metadata: null, optional: { decision: { method: "jev", reason: "answered" } } }));
  assert.equal(status.mode, "jev"); assert.equal(status.coverage, "unknown"); assert.match(status.summary, /coverage is unknown/);
  const inactive = { reason: "metadata-question-disabled", coverage: { answeredCount: 0, permittedCount: 50, complete: false, applied: false } };
  const used = contextSelectionStatus(packet({ metadata: inactive, optional: { decision: { method: "jev", reason: "answered" } } }));
  assert.equal(used.mode, "jev"); assert.equal(used.coverage, "unknown"); assert.equal(used.reason, "answered");
  const fallback = contextSelectionStatus(packet({ metadata: inactive, optional: { reason: "provider-unavailable", decision: null } }));
  assert.equal(fallback.mode, "local"); assert.match(fallback.summary, /provider-unavailable/);
});

test("ordinary presentation exposes provider failure while required guidance remains usable", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-presentation-")), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
    mkdirSync(join(root, "config/governance"), { recursive: true });
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ profile_id: "fixture", context_router: {
      routes: [{ id: "fix", match: { prompt_terms: ["fix"] }, primary_context: ["rules.md"], skills: [] }] } }));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
    writeFileSync(join(root, "rules.md"), "Required local guidance");
    writeFileSync(join(root, "optional.ts"), "Optional source context");
    const routed = await contextRouteCommand(["--task", "fix", "--revision", "1", "--optional-path", "optional.ts"], root,
      resolve("src/project_governance_runtime/assets/skills"), { async decide() { throw new Error("unavailable"); } });
    const shown = presentContextRoute(routed);
    assert.equal(shown.ready, true); assert.equal(shown.selectionStatus.mode, "local");
    assert.equal(routed.entries[0]?.content, "Required local guidance");
    assert.match(shown.selectionStatus.summary, /provider-unavailable/);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
