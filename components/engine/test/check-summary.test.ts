import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSummary } from "../src/check-summary.ts";
import { digest } from "../src/core.ts";
import { normalizeCheck } from "../src/checker-results.ts";

test("summary preserves failed, blocked and advisory evidence without raw execution data", () => {
  const plan = { status: "blocked", stage: "pre-commit", mode: "impacted", changed_paths: ["secret-source"], selected_packs: ["a"], execution_order: ["a"], blockers: [{ code: "missing", message: "Missing prerequisite", raw: "private" }] };
  const result = { status: "failed", run_id: "run", termination_reason: "cancelled", plan, blocked: { b: ["a"] }, results: [
    { pack_id: "a", status: "failed", commands: [{ status: "failed", termination_reason: "cancelled", stdout: "private-log", argv: ["secret-command"], findings: [{ rule_id: "a.rule", severity: "blocking", message: "Repair input", raw: "private-source" }] }] },
    { pack_id: "c", status: "passed", commands: [{ findings: [{ rule_id: "c.rule", severity: "advisory", message: "Inspect warning" }] }] },
  ] };
  const summary = checkSummary(result);
  assert.equal(summary.status, "failed");
  assert.equal(summary.termination_reason, "cancelled");
  assert.deepEqual(summary.blocked_packs, { b: ["a"] });
  assert.equal((summary.findings as unknown[]).length, 2);
  assert.equal((summary.plan as Record<string, unknown>).changed_path_count, 1);
  assert.equal((summary.nonpassing_packs as unknown[]).length, 1);
  assert.doesNotMatch(JSON.stringify(summary), /private|secret-/);
  assert.match(JSON.stringify(result), /private-log/);
});

test("compact results retain complete findings, cleanup concerns and original receipt identity", () => {
  const message = "Required failure detail: " + "context ".repeat(80) + "the contradictory result remains unresolved";
  const result = { run_id: "run", run_directory: "/retained/run", status: "failed", plan: { changed_paths: [] }, results: [
    { pack_id: "test", status: "failed", commands: [
      { status: "failed", failure_kind: "check", integrity_failure: false, process_failure: true,
        command_receipt: { state: "failed", cleanup: "unknown", exitCode: 1, log: "/retained/run/output.log", requestDigest: "bound-command" },
        findings: [{ rule_id: "test.failure", severity: "blocking", message }], stdout: "large raw output" },
      { status: "passed", command_receipt: { state: "succeeded", cleanup: "confirmed", exitCode: 0 } },
    ] },
  ] };
  const summary = checkSummary(result);
  assert.equal((summary.findings as Record<string, unknown>[])[0]!.message, message);
  assert.deepEqual(summary.cleanup, { observed_commands: 2, confirmed: 1 });
  const issue = (summary.command_issues as Record<string, unknown>[])[0]!;
  assert.equal(issue.process_failure, true);
  assert.equal((issue.command_receipt as Record<string, unknown>).cleanup, "unknown");
  assert.deepEqual(summary.evidence, { path: "/retained/run/result.json", digest: digest(result), digest_format: "canonical-json",
    note: "Canonical-JSON digest of the parsed result, not the file-byte digest in metrics.json; outcome and retention are unchanged." });
  assert.doesNotMatch(JSON.stringify(summary), /large raw output/);
});

test("large generated failure findings are labelled excerpts with original native output intact", () => {
  const stderr = "raw diagnostic details\n".repeat(12000);
  const command = normalizeCheck({ exit_code: 1, termination_reason: "completed", stdout: '{"status":"failed","findings":[]}', stderr }, ["checker"]);
  const original = JSON.stringify(command);
  const summary = checkSummary({ status: "failed", plan: {}, results: [{ pack_id: "test", status: "failed", commands: [command] }] });
  assert.equal((summary.findings as Record<string, unknown>[])[0]!.message_truncated, true);
  assert.ok(JSON.stringify(summary).length < original.length / 10);
  assert.equal(JSON.stringify(command), original);
  assert.ok(!JSON.stringify(summary).includes("command_index"));
});

test("an incomplete cleanup without a native receipt stays visible", () => {
  const summary = checkSummary({ status: "failed", plan: {}, results: [
    { pack_id: "test", status: "failed", commands: [{ status: "failed", termination_reason: "cleanup-unknown" }] },
  ] });
  assert.deepEqual(summary.cleanup, { observed_commands: 0, confirmed: 0 });
  assert.equal((summary.command_issues as Record<string, unknown>[])[0]!.termination_reason, "cleanup-unknown");
});

test("invalid generated status is bounded, UTF-8 intact, and malformed plans remain observable", () => {
  const command = normalizeCheck({ exit_code: 0, termination_reason: "completed", stdout: JSON.stringify({ status: "🧭".repeat(20000), findings: [] }), stderr: "" }, ["checker"]);
  const original = JSON.stringify(command);
  for (const plan of [null, "bad", []]) {
    const summary = checkSummary({ status: "failed", plan, results: [{ pack_id: "test", status: "failed", commands: [command] }] });
    const finding = (summary.findings as Record<string, unknown>[]).find(row => row.rule_id === "checker.status-invalid")!;
    assert.equal(finding.message_truncated, true);
    assert.ok(Buffer.byteLength(String(finding.message)) <= 4096);
    assert.ok(!String(finding.message).includes("\uFFFD"));
    assert.deepEqual(summary.plan, { unavailable: true });
    assert.equal(summary.status, "failed");
  }
  assert.equal(JSON.stringify(command), original);
});

test("oversized authored output is labelled, and malformed presentation cannot change the native outcome", () => {
  const command = normalizeCheck({ exit_code: 1, termination_reason: "completed", stdout: JSON.stringify({ status: "failed", findings: [{ severity: "blocking", message: "raw ".repeat(20000) }] }), stderr: "" }, ["checker"]);
  const summary = checkSummary({ status: "failed", results: [{ pack_id: "test", commands: [command] }] });
  assert.ok(JSON.stringify(summary).length < 6000);
  assert.equal((summary.findings as Record<string, unknown>[])[0]!.message_truncated, true);
  assert.deepEqual(checkSummary({ run_id: "test", status: "failed", results: [null] }), { run_id: "test", status: "failed", summary_unavailable: true });
  const blocked = checkSummary({ status: "blocked", blockers: [{ code: "invalid-dependency-graph", message: "🧭".repeat(10000) }] });
  const blocker = (blocked.blockers as Record<string, unknown>[])[0]!;
  assert.equal(blocker.message_truncated, true); assert.ok(Buffer.byteLength(String(blocker.message)) <= 4096);
  assert.ok(!String(blocker.message).includes("\uFFFD"));
});
