import { object } from "./core.ts";

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(item => object(item)) : [];
const pick = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, key === "message" && typeof value[key] === "string" ? value[key].slice(0, 500) : value[key]]));

/** Keep gate identity and actionable findings without copying commands, logs or source inventories. */
export function checkSummary(value: unknown): Record<string, unknown> {
  const result = object(value);
  if (!Array.isArray(result.results)) {
    return { ...pick(result, ["status", "stage", "mode", "selected_packs", "execution_order"]),
      changed_path_count: Array.isArray(result.changed_paths) ? result.changed_paths.length : 0,
      blockers: records(result.blockers).map(blocker => pick(blocker, ["code", "pack_id", "pack_ids", "message"])) };
  }
  const findings: Record<string, unknown>[] = [], nonpassing: Record<string, unknown>[] = [];
  for (const pack of records(result.results)) {
    const commands = records(pack.commands);
    const evidence = pack.evidence_manifest ? object(pack.evidence_manifest) : null;
    if (pack.status !== "passed" || (evidence && evidence.status !== "valid")) {
      nonpassing.push({ ...pick(pack, ["pack_id", "status"]),
        termination_reasons: commands.map(command => command.termination_reason).filter(reason => typeof reason === "string" && reason !== "completed"),
        ...(evidence ? { evidence_manifest_status: evidence.status } : {}) });
    }
    for (const source of [...commands, ...(evidence ? [evidence] : [])]) {
      for (const finding of records(source.findings)) {
        if (finding.severity !== "blocking" && finding.severity !== "advisory") continue;
        findings.push({ pack_id: pack.pack_id, ...pick(finding, ["rule_id", "severity", "path", "line", "message"]) });
      }
    }
  }
  return { ...pick(result, ["run_id", "status", "termination_reason", "duration_ms", "subject_digest"]),
    plan: checkSummary(result.plan), blocked_packs: result.blocked ?? {}, nonpassing_packs: nonpassing, findings };
}
