export const FINDING_STATES = ["blocking", "advisory", "accepted", "waived", "suppressed"] as const;
export interface Finding extends Record<string, unknown> { rule_id: string; severity: typeof FINDING_STATES[number] }
export interface NativeCheckResult { exit_code: number; termination_reason: string; stdout: string; stderr: string }
const ENVELOPES = ["passed", "warning", "failed", "not-applicable"];

/** Findings retain accepted/waived/suppressed states; only active findings determine gate status. */
export function findingSummary(findings: Finding[]) {
  const counts = Object.fromEntries(FINDING_STATES.map(state => [state, findings.filter(f => f.severity === state).length]));
  return { status: counts["blocking"] ? "failed" : counts["advisory"] ? "warning" : "passed", finding_count: findings.length, finding_counts: counts };
}

/** Native failure and invalid machine output cannot be hidden by a passing checker envelope. */
export function normalizeCheck(result: NativeCheckResult, argv: string[]) {
  let structured: { status: string; findings: unknown[] } | null = null;
  try {
    const raw = JSON.parse(result.stdout);
    if (raw && typeof raw === "object" && typeof raw.status === "string" && Array.isArray(raw.findings)) structured = raw;
  } catch { /* Invalid or mixed stdout is an integrity failure, never an empty pass. */ }
  const declared = structured?.status ?? "failed", declaredValid = ENVELOPES.includes(declared);
  const processFailed = result.exit_code !== 0 || result.termination_reason !== "completed";
  const severity = processFailed || declared === "failed" ? "blocking" : "advisory";
  let invalidState = false;
  const findings: Finding[] = (structured?.findings ?? []).map(item => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const value = item as Record<string, unknown>;
      if (!(FINDING_STATES as readonly unknown[]).includes(value["severity"])) {
        invalidState = true;
        return { ...value, rule_id: "checker.finding-severity-invalid", severity: "blocking", reported_severity: value["severity"] ?? null,
          message: `structured finding must declare one of: ${FINDING_STATES.join(", ")}` };
      }
      return { rule_id: "checker.finding", ...value } as Finding;
    }
    return { rule_id: "checker.finding", severity, message: String(item) };
  });
  let integrity = !processFailed && (!structured || !declaredValid || invalidState);
  if (!structured) findings.push({ rule_id: "checker.output-invalid", severity: "blocking", message: "checker must emit one JSON object with a string status and findings array" });
  if (!declaredValid) findings.push({ rule_id: "checker.status-invalid", severity: "blocking", message: `checker declared unknown envelope status '${declared}'` });
  let summary = findingSummary(findings);
  const reportedBlocking = summary.finding_counts["blocking"]! > 0;
  const status = processFailed || declared === "failed" || !declaredValid || summary.status === "failed" ? "failed" :
    summary.status === "warning" ? "warning" : declared === "not-applicable" ? "not-applicable" : "passed";
  if (status === "failed" && !reportedBlocking) {
    if (!processFailed) integrity = true;
    findings.push({ rule_id: "checker.command-failed", severity: "blocking", message: result.stderr.trim() || result.stdout.trim() || "checker command failed" });
    summary = findingSummary(findings);
  }
  let failure: string | null = null;
  if (status === "failed") {
    if (["timeout", "cancelled"].includes(result.termination_reason)) failure = result.termination_reason;
    else if (result.termination_reason !== "completed") failure = "execution";
    else if (!structured || !declaredValid || invalidState) failure = "invalid-output";
    else if (result.exit_code < 0) failure = "execution";
    else failure = reportedBlocking ? "check" : "execution";
  }
  return { argv, status, ...result, finding_count: summary.finding_count, finding_counts: summary.finding_counts,
    process_failure: processFailed, integrity_failure: integrity, failure_kind: failure, findings };
}
