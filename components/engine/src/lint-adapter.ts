import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { digest, durableJson } from "./core.ts";
import { executeLintBackend, type LintToolRunner } from "./lint-backends.ts";
import { verifyLintInputs } from "./lint-inputs.ts";

/** A helper of the existing custom-command lane; the outer owner retains receipts, cancellation and cleanup. */
export async function lintAdapterCommand(args: string[], env = process.env, runner?: LintToolRunner) {
  let evidence = "";
  try {
    const { values } = parseArgs({ args, strict: true, options: { pack: { type: "string" } } });
    evidence = env.PROJECT_GOVERNANCE_EVIDENCE_ROOT ?? "";
    const path = env.PROJECT_GOVERNANCE_LINT_INPUTS ?? "", sha = env.PROJECT_GOVERNANCE_LINT_INPUTS_SHA256 ?? "";
    if (!evidence || !values.pack) throw new Error("Lint adapter requires its captured owner inputs");
    const input = verifyLintInputs(evidence, path, sha);
    if (input.pack_id !== values.pack || (input.subject_digest ?? "") !== (env.PROJECT_GOVERNANCE_SUBJECT_DIGEST ?? "")) throw new Error("Lint subject or pack binding differs");
    const result = await executeLintBackend(input, evidence, runner);
    verifyLintInputs(evidence, path, sha);
    const input_manifest = { version: 1, status: "complete", input_mode: input.input_mode,
      files: input.snapshots.map(entry => ({ path: entry.path, sha256: entry.sha256 })), tool: { backend: input.declaration.backend, version: result.backend_version, argv: input.declaration.tool.argv }, config: input.declaration.config };
    const details = { version: 1, backend: input.declaration.backend, backend_version: result.backend_version, input_mode: input.input_mode,
      subject_digest: input.subject_digest, selected_count: input.selected.length, checked_count: result.checked, excluded_count: input.excluded.length,
      selected_paths: input.selected, excluded_paths: input.excluded, widening_reason: input.widening_reason, input_manifest, native_results: result.native_results, findings: result.findings };
    const detailPath = join(evidence, "lint-result.json"); durableJson(detailPath, details);
    if (input.subject_digest) {
      const artifact = createHash("sha256").update(readFileSync(detailPath)).digest("hex");
      durableJson(join(evidence, "evidence-manifest.json"), { kind: "project-governance-evidence-manifest", version: 1, subject_digest: input.subject_digest,
        claims: [{ id: "lint.result", outcome: result.status === "warning" ? "passed" : result.status, artifact_digests: [`sha256:${artifact}`] }] });
    }
    return { exitCode: 0, value: { status: result.status, findings: result.findings, input_manifest,
      lint_evidence: { path: detailPath, digest: digest(details), backend: input.declaration.backend, version: result.backend_version,
        checked_count: result.checked, input_mode: input.input_mode } } };
  } catch (error) {
    const value = { status: "failed", findings: [{ rule_id: "lint.infrastructure-failed", severity: "blocking", message: error instanceof Error ? error.message : "Lint adapter failed" }] };
    if (evidence) { try { writeFileSync(join(evidence, "lint-failure.json"), JSON.stringify(value) + "\n", { flag: "wx", mode: 0o600 }); } catch { /* Existing owner still retains the failing command envelope. */ } }
    return { exitCode: 2, value };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await lintAdapterCommand(process.argv.slice(2)); console.log(JSON.stringify(result.value)); process.exitCode = result.exitCode;
}
