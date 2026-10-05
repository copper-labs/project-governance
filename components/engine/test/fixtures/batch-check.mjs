import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// This is a synthetic target checker. Governance owns its packet and process supervision.
const mode = process.argv[2];
const emit = value => console.log(JSON.stringify(value));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
try {
  if (mode === "infrastructure") {
    emit({ status: "passed", findings: [] });
    process.exitCode = 7;
  } else if (mode === "review") {
    const prior = JSON.parse(process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ARTIFACTS_JSON);
    const result = JSON.parse(readFileSync(join(prior.batch, "batch-result.json"), "utf8"));
    if (result.status !== "passed") throw new Error("Review requires a passed batch result");
    const packet = JSON.parse(readFileSync(join(result.run_directory, "packet/change-packet.json"), "utf8"));
    const receipt = { requirement: "Release one fixture owner without releasing its sibling", run_id: result.run_id,
      subject_digest: packet.subject_digest, difference: packet.records.map(record => ({ path: record.path,
        before_sha256: record.before_sha256, after_sha256: record.after_sha256 })),
      original_result: join(result.run_directory, "result.json"), unknowns: ["No semantic reviewer was invoked"] };
    writeFileSync(join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR, "review-input.json"), JSON.stringify(receipt));
    emit({ status: "passed", findings: [] });
  } else {
    const bytes = readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET);
    if (sha256(bytes) !== process.env.PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256) throw new Error("Packet digest differs");
    const packet = JSON.parse(bytes);
    if (!packet.subject_digest || packet.subject_digest !== process.env.PROJECT_GOVERNANCE_SUBJECT_DIGEST)
      throw new Error("Content-bound subject is required");
    const applicable = packet.records.filter(record => record.after_path &&
      (mode === "rule" ? record.path.endsWith(".owner.json") : record.path === "src/owner-lifecycle.mjs"));
    if (!applicable.length) throw new Error("Declared check has no captured input");
    for (const record of applicable) {
      if (record.after_file_type !== "regular" || sha256(readFileSync(record.after_path)) !== record.after_sha256)
        throw new Error("Captured source differs");
    }
    if (mode === "rule") {
      const findings = applicable.flatMap(record => {
        const value = JSON.parse(readFileSync(record.after_path, "utf8"));
        return typeof value.owner === "string" && value.owner.trim() ? [] : [{ rule_id: "fixture.owner-required",
          severity: "blocking", path: record.path, message: "Declare a nonempty owner before acquiring a fixture resource." }];
      });
      emit({ status: findings.length ? "failed" : "passed", findings,
        evidence: { subject_digest: packet.subject_digest, evaluated_paths: applicable.map(record => record.path) } });
    } else if (mode === "lifecycle") {
      const executed = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
        fileURLToPath(new URL("batch-lifecycle.test.mjs", import.meta.url))], { encoding: "utf8", timeout: 5000 });
      const evidence = process.env.PROJECT_GOVERNANCE_EVIDENCE_ROOT;
      writeFileSync(join(evidence, "lifecycle.tap"), executed.stdout ?? "");
      writeFileSync(join(evidence, "lifecycle.stderr"), executed.stderr ?? "");
      if (executed.error || executed.signal || ![0, 1].includes(executed.status)) throw new Error("Test process did not complete");
      const intendedFailure = /not ok \d+ - release keeps another owner in the same worktree/.test(executed.stdout);
      if (executed.status === 1 && !intendedFailure) throw new Error("Test failed outside the seeded owner-isolation assertion");
      emit({ status: intendedFailure ? "failed" : "passed", findings: intendedFailure ? [{ rule_id: "fixture.lifecycle-owner-isolation",
        severity: "blocking", path: "src/owner-lifecycle.mjs", message: "Releasing one owner also released its sibling in the same worktree.",
        evidence: join(evidence, "lifecycle.tap") }] : [],
        evidence: { subject_digest: packet.subject_digest, test_exit_code: executed.status, original: join(evidence, "lifecycle.tap") } });
    } else throw new Error("Unknown fixture checker mode");
  }
} catch (error) {
  emit({ status: "failed", findings: [{ rule_id: "fixture.checker-infrastructure", severity: "blocking",
    message: error.message }] });
  process.exitCode = 2;
}
