import type { Packs } from "./pack-configuration.ts";
import { commandApplies, type ValidationPlan } from "./planning.ts";
import { runBuiltinCheck, type BuiltinCheckRequest } from "./builtin-checks.ts";
import { findingSummary, type Finding } from "./checker-results.ts";
export interface CheckResult { status: string; findings: Finding[]; [key: string]: unknown }
export type CustomCheckDispatcher = (entry: unknown, packId: string, index: number) => Promise<CheckResult>;
export interface PackEvidence { status: string; findings: Finding[]; [key: string]: unknown }
export type PackFinalizer = (packId: string) => Promise<PackEvidence> | PackEvidence;
export type CheckDispatcher = (request: BuiltinCheckRequest) => Promise<CheckResult>;
/** Independent checks continue after ordinary findings; failed prerequisites never run. */
export async function executeChecks(packs: Packs, plan: ValidationPlan, request: Omit<BuiltinCheckRequest, "id">, dispatch: CheckDispatcher = runBuiltinCheck, custom?: CustomCheckDispatcher, finalize?: PackFinalizer, cancelled: () => boolean = () => false, expired: () => boolean = () => false) {
  const results: Array<{ pack_id: string; status: string; commands: CheckResult[]; evidence_manifest?: PackEvidence }> = [], blocked: Record<string, string[]> = {}, failed = new Set<string>();
  let status = plan.status === "blocked" ? "failed" : "passed";
  if (plan.status === "blocked") return { status, results, blocked, plan };
  for (const id of plan.execution_order) {
    if (expired() || cancelled()) return { status: "failed", termination_reason: expired() ? "deadline" : "cancelled", results, blocked, plan };
    const pack = packs[id]; if (!pack) throw new Error("Planned pack is unavailable");
    const prerequisites = pack.depends_on.filter(dependency => failed.has(dependency));
    if (prerequisites.length) { blocked[id] = prerequisites; failed.add(id); if (pack.enforcement === "blocking") status = "failed"; continue; }
    const commands: CheckResult[] = [];
    let integrity = false;
    for (const [commandIndex, raw] of pack.commands.entries()) {
      if (expired() || cancelled()) {
        if (commands.length) results.push({ pack_id: id, status: "failed", commands });
        return { status: "failed", termination_reason: expired() ? "deadline" : "cancelled", results, blocked, plan };
      }
      if (plan.stage && !commandApplies(raw, plan.stage)) continue;
      const command = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      let result: CheckResult;
      if (!Object.hasOwn(command, "builtin") && custom) {
        try { result = await custom(raw, id, commandIndex); }
        catch { result = { status: "failed", findings: [{ rule_id: "checker.invocation-invalid", severity: "blocking", message: "Custom checker could not resolve its command or execution evidence." }] }; }
      } else if (typeof command["builtin"] !== "string" || Object.keys(command).some(key => !["builtin", "stages", "arguments"].includes(key))) {
        result = { status: "failed", findings: [{ rule_id: "checker.command-unsupported", severity: "blocking", message: "This command needs an execution adapter that is not available in this preview." }] };
        integrity = true;
      } else if (command["arguments"] !== undefined && (!Array.isArray(command["arguments"]) || command["arguments"].some(value => !["commit_message_file", "pr_body_file", "pr_title"].includes(String(value))))) {
        result = { status: "failed", findings: [{ rule_id: "checker.invocation-invalid", severity: "blocking", message: "Unsupported built-in argument binding." }] };
      } else {
        try { result = await dispatch({ ...request, id: command["builtin"] }); }
        catch { result = { status: "failed", findings: [{ rule_id: "checker.invocation-invalid", severity: "blocking", message: "Checker execution did not produce a result." }] }; }
      }
      if (!["passed", "warning", "failed", "not-applicable"].includes(result.status) || !Array.isArray(result.findings)) throw new Error("Invalid checker result");
      const summary = findingSummary(result.findings);
      if (result["integrity_failure"] || result["process_failure"]) integrity = true;
      if (result.status === "failed" && summary.status !== "failed") integrity = true;
      if (result.findings.some(finding => ["checker.invocation-invalid", "checker.command-unsupported"].includes(finding.rule_id))) integrity = true;
      commands.push({ ...result, status: summary.status === "failed" ? "failed" : result.status });
      if (integrity || (result.status === "failed" && pack["fail_fast"] !== false)) break;
    }
    if (!commands.length) throw new Error("Selected pack has no applicable command");
    const evidence = finalize ? await finalize(id) : undefined;
    if (evidence?.status === "invalid") integrity = true;
    const packStatus = evidence?.status === "invalid" || commands.some(result => result.status === "failed") ? "failed" : commands.some(result => result.status === "warning") ? "warning" : "passed";
    results.push({ pack_id: id, status: packStatus, commands, ...(evidence ? { evidence_manifest: evidence } : {}) });
    if (packStatus === "failed") { failed.add(id); if (pack.enforcement === "blocking" || integrity) status = "failed"; }
    if (status === "passed" && ["failed", "warning"].includes(packStatus)) status = "warning";
    if (integrity) { status = "failed"; break; }
  }
  return { status: expired() || cancelled() ? "failed" : status, termination_reason: expired() ? "deadline" : cancelled() ? "cancelled" : "completed", results, blocked, plan };
}
