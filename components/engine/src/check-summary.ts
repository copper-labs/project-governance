import { isAbsolute, join } from "node:path";
import { digest, object } from "./core.ts";

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(item => object(item)) : [];
const pick = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function utf8Tail(text: string, limit: number): string {
  const bytes = Buffer.from(text);
  let start = Math.max(0, bytes.length - limit);
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return bytes.subarray(start).toString("utf8");
}
function boundedMessage(selected: Record<string, unknown>) {
  if (typeof selected.message !== "string" || Buffer.byteLength(selected.message) <= 4096) return selected;
  const bytes = Buffer.from(selected.message); let head = 2000;
  while ((bytes[head]! & 0xc0) === 0x80) head--;
  return { ...selected, message: bytes.subarray(0, head).toString("utf8") + "\n[excerpt; full message retained]\n" + utf8Tail(selected.message, 2000),
    message_truncated: true, detail: "Oversized message excerpt; the complete original remains available (--full)." };
}

/** Keep gate identity and actionable findings without copying commands, logs or source inventories. */
export function checkSummary(value: unknown): Record<string, unknown> {
  try { return compactCheckSummary(value); }
  catch { return isRecord(value) ? { ...pick(value, ["run_id", "status", "termination_reason"]), summary_unavailable: true } : { summary_unavailable: true }; }
}
function compactCheckSummary(value: unknown): Record<string, unknown> {
  const result = object(value);
  if (!Array.isArray(result.results)) {
    return { ...pick(result, ["status", "stage", "mode", "selected_packs", "execution_order"]),
      changed_path_count: Array.isArray(result.changed_paths) ? result.changed_paths.length : 0,
      blockers: records(result.blockers).map(blocker => boundedMessage(pick(blocker, ["code", "pack_id", "pack_ids", "message"]))) };
  }
  const findings: Record<string, unknown>[] = [], nonpassing: Record<string, unknown>[] = [];
  const commandIssues: Record<string, unknown>[] = [];
  let observedCleanup = 0, confirmedCleanup = 0;
  for (const pack of records(result.results)) {
    const commands = records(pack.commands);
    for (const command of commands) {
      const receipt = command.command_receipt ? object(command.command_receipt) : null;
      if (receipt) { observedCleanup++; if (receipt.cleanup === "confirmed") confirmedCleanup++; }
      if (command.status === "failed" || command.integrity_failure === true || command.process_failure === true ||
          command.termination_reason === "cleanup-unknown" || command.termination_reason === "outcome-unknown" ||
          (receipt && receipt.cleanup !== "confirmed")) {
        commandIssues.push({ pack_id: pack.pack_id,
          ...pick(command, ["request_digest", "status", "termination_reason", "failure_kind", "integrity_failure", "process_failure", "exit_code"]),
          ...(receipt ? { command_receipt: pick(receipt, ["state", "exitCode", "signal", "reason", "cleanup", "log", "stdout", "stderr", "requestDigest"]) } : {}) });
      }
    }
    const evidence = pack.evidence_manifest ? object(pack.evidence_manifest) : null;
    if (pack.status !== "passed" || (evidence && evidence.status !== "valid")) {
      nonpassing.push({ ...pick(pack, ["pack_id", "status"]),
        termination_reasons: commands.map(command => command.termination_reason).filter(reason => typeof reason === "string" && reason !== "completed"),
        ...(evidence ? { evidence_manifest_status: evidence.status } : {}) });
    }
    for (const source of [...commands, ...(evidence ? [evidence] : [])]) {
      for (const finding of records(source.findings)) {
        if (finding.severity !== "blocking" && finding.severity !== "advisory") continue;
        // Authored or generated messages may contain a raw stream; retain both ends and originals.
        const selected = boundedMessage(pick(finding, ["rule_id", "severity", "path", "line", "message"]));
        findings.push({ pack_id: pack.pack_id, ...selected });
      }
    }
  }
  return { ...pick(result, ["run_id", "status", "termination_reason", "duration_ms", "subject_digest"]),
    plan: isRecord(result.plan) ? checkSummary(result.plan) : { unavailable: true }, blocked_packs: result.blocked ?? {}, nonpassing_packs: nonpassing, findings,
    command_issues: commandIssues, cleanup: { observed_commands: observedCleanup, confirmed: confirmedCleanup },
    ...(typeof result.run_directory === "string" && isAbsolute(result.run_directory) ? {
      evidence: { path: join(result.run_directory, "result.json"), digest: digest(result), digest_format: "canonical-json",
        note: "Canonical-JSON digest of the parsed result, not the file-byte digest in metrics.json; outcome and retention are unchanged." },
    } : {}) };
}
