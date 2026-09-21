import { createHash } from "node:crypto";
import { openSync, closeSync, fstatSync, readSync, constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { observeCommand } from "./process-owner.ts";
import { workflowOperation } from "./workflow-operation.ts";
import { validateInputs } from "./workflow-types.ts";
import { digest, object, text } from "./core.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretChoice, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";

const LOG_WINDOW = 8000, MAX_OBSERVATIONS = 8, MAX_PROBES = 8;

export interface DiagnosticEvidence {
  version: 1; run: string; stage: string; taskRevision: number;
  target: { kind: string; id: string; name?: string };
  artifact?: { kind: string; path?: string; digest: string };
  observations?: Array<{ id: string; text: string }>;
  probes?: Array<{ id: string; description: string; effect: "read" }>;
}

/** A caller-supplied envelope is checked evidence, never newly proved device state. */
export function parseDiagnosticEvidence(raw: unknown): DiagnosticEvidence {
  const value = object(raw, "diagnostic evidence");
  for (const key of Object.keys(value)) if (!["version", "run", "stage", "taskRevision", "target", "artifact", "observations", "probes"].includes(key)) throw new Error("Unknown diagnostic evidence field");
  if (value["version"] !== 1) throw new Error("Unsupported diagnostic evidence version");
  const target = object(value["target"], "diagnostic target");
  const revision = value["taskRevision"];
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) throw new Error("Diagnostic evidence requires the bound task revision");
  const observations = value["observations"] ?? [];
  const probes = value["probes"] ?? [];
  if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS || !Array.isArray(probes) || probes.length > MAX_PROBES) throw new Error("Diagnostic observation or probe list exceeds its bound");
  const envelope: DiagnosticEvidence = {
    version: 1, run: text(value["run"], "diagnostic run id", 128), stage: text(value["stage"], "diagnostic stage id", 128),
    taskRevision: revision as number,
    target: { kind: text(target["kind"], "target kind", 64), id: text(target["id"], "target id", 256),
      ...(target["name"] === undefined ? {} : { name: text(target["name"], "target name", 256) }) },
    observations: observations.map(item => { const entry = object(item, "diagnostic observation");
      return { id: text(entry["id"], "observation id", 128), text: text(entry["text"], "observation text", 4000) }; }),
    probes: probes.map(item => { const entry = object(item, "diagnostic probe");
      if (entry["effect"] !== "read") throw new Error("RC1 device advice only lists read-only probes");
      return { id: text(entry["id"], "probe id", 128), description: text(entry["description"], "probe description", 500), effect: "read" as const }; }),
  };
  if (value["artifact"] !== undefined) {
    const artifact = object(value["artifact"], "diagnostic artifact");
    const hash = text(artifact["digest"], "artifact digest", 128);
    if (!/^sha256:[a-f0-9]{64}$/u.test(hash)) throw new Error("Artifact digest must be a canonical SHA-256 identity");
    envelope.artifact = { kind: text(artifact["kind"], "artifact kind", 64), digest: hash,
      ...(artifact["path"] === undefined ? {} : { path: text(artifact["path"], "artifact path", 1024) }) };
  }
  return envelope;
}

function boundedTail(path: string, window: number): { text: string; digest: string; bytes: number; totalBytes: number; truncated: boolean } | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) return null;
    const start = Math.max(0, stat.size - window);
    const buffer = Buffer.alloc(Math.min(window, stat.size));
    let read = 0;
    while (read < buffer.length) {
      const count = readSync(fd, buffer, read, buffer.length - read, start + read);
      if (!count) break;
      read += count;
    }
    const slice = buffer.subarray(0, read);
    const content = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return { text: content, digest: `sha256:${createHash("sha256").update(slice).digest("hex")}`, bytes: read, totalBytes: stat.size, truncated: start > 0 };
  } catch { return null; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* Preserve the diagnostic result. */ } }
}

export interface DeviceAdvice {
  version: 1; kind: "project-governance-device-advice";
  authority: "advisory only: no probe, reset, rebuild or recovery is dispatched; native classification, target identity and cleanup state are unchanged";
  mode: string; effect: string; reason: string; delivered: boolean;
  stage: { id: string; state: string; exitCode: number | null; cleanup: string; inputValidity: string } | null;
  binding: { run: string; taskId: string; taskRevision: number; target: DiagnosticEvidence["target"] | null; artifact: { kind: string; digest: string; bound: boolean } | null };
  evidence: { logPath: string | null; logDigest: string | null; bytes: number | null; totalBytes: number | null; windowTruncated: boolean; envelope: "supplied" | "absent" };
  diagnosis: { category: string; confidence: number | null; margin: number | null } | null;
  unknownDiagnosis: boolean;
  nextProbe: { id: string; confidence: number | null } | null;
  coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/** Check the existing command owner before reading any purported stage log. */
function boundLog(run: WorkflowRun, failed: WorkflowStage): string | null {
  try {
    const path = failed.result!.log, directory = dirname(path);
    if (path !== join(directory, "output.log") || realpathSync(path) !== path || !lstatSync(path).isFile()) return null;
    const requestPath = join(directory, "request.json");
    if (!lstatSync(requestPath).isFile() || lstatSync(requestPath).size > 65536) return null;
    const request = object(JSON.parse(readFileSync(requestPath, "utf8")));
    const stage = run.binding.recipe.stages.find(item => item.id === failed.id);
    if (!stage || request.id !== `${run.id}:${stage.id}` ||
      digest(request.operation) !== digest(workflowOperation(run.binding.recipe, run.id, stage, dirname(directory)))) return null;
    const receipt = observeCommand(directory, digest(request)).receipt;
    if (!receipt || receipt.log !== path || receipt.exitCode !== failed.result!.exitCode ||
      receipt.startedAt !== failed.result!.startedAt || receipt.endedAt !== failed.result!.endedAt) return null;
    return path;
  } catch { return null; }
}

/** Read only a log whose native request and result match the selected workflow stage. */
export function workflowStageExcerpt(run: WorkflowRun, stage: WorkflowStage) {
  if (!stage.result) return null;
  const path = boundLog(run, stage);
  return path ? boundedTail(path, LOG_WINDOW) : null;
}

/**
 * Interpret bounded evidence already captured for one failed stage. The run, stage, task revision,
 * source validity and worker request bind the evidence; missing fields stay explicitly missing.
 */
export async function deviceAdvice(runtime: DecisionRuntime, run: WorkflowRun, stages: WorkflowStage[],
  envelope: DiagnosticEvidence | null, scope: BudgetScope | null,
  options: { policyDigest: string; environment: string }): Promise<DeviceAdvice> {
  const eligibility = runtime.eligibility("DL05");
  const limits: string[] = [], unavailable: string[] = [];
  const failed = stages.find(stage => stage.state === "failed" || stage.state === "unknown") ?? null;
  const result = failed?.result ?? null;
  const base: DeviceAdvice = {
    version: 1, kind: "project-governance-device-advice",
    authority: "advisory only: no probe, reset, rebuild or recovery is dispatched; native classification, target identity and cleanup state are unchanged",
    mode: eligibility.mode, effect: "advise", reason: eligibility.reasons[0] ?? "no-failed-stage", delivered: false,
    stage: failed && result ? { id: failed.id, state: failed.state, exitCode: result.exitCode, cleanup: result.cleanup, inputValidity: result.inputValidity } : null,
    binding: { run: run.id, taskId: run.binding.taskId, taskRevision: run.binding.taskVersion, target: envelope?.target ?? null, artifact: null },
    evidence: { logPath: result?.log ?? null, logDigest: null, bytes: null, totalBytes: null, windowTruncated: false, envelope: envelope ? "supplied" : "absent" },
    diagnosis: null, unknownDiagnosis: false, nextProbe: null,
    coverage: { captured: 0, omitted: [], truncated: false, unavailable, limits }, decision: null,
  };
  if (!failed || !result) return base;
  if (!envelope) return { ...base, reason: "diagnostic-envelope-required" };
  if (result.inputValidity !== "valid" || !validateInputs(run.binding.recipe)) return { ...base, reason: "stale-source" };
  if (envelope) {
    // Binding is checked before any evidence is prepared; a mismatch is reported, never repaired.
    if (envelope.run !== run.id) return { ...base, reason: "evidence-run-mismatch", coverage: { ...base.coverage, unavailable: ["diagnostic-evidence"], limits: [...limits, "supplied evidence names another run"] } };
    if (envelope.stage !== failed.id) return { ...base, reason: "evidence-stage-mismatch", coverage: { ...base.coverage, unavailable: ["diagnostic-evidence"], limits: [...limits, "supplied evidence names another stage"] } };
    if (envelope.taskRevision !== run.binding.taskVersion) return { ...base, reason: "evidence-revision-stale", coverage: { ...base.coverage, unavailable: ["diagnostic-evidence"], limits: [...limits, "supplied evidence names another task revision"] } };
    if (envelope.artifact) {
      const input = envelope.artifact.path ? run.binding.recipe.inputs.find(entry => entry.path === envelope.artifact!.path) : undefined;
      const bound = Boolean(input && input.digest === envelope.artifact.digest);
      if (!bound) return { ...base, reason: "artifact-binding-mismatch" };
      base.binding.artifact = { kind: envelope.artifact.kind, digest: envelope.artifact.digest, bound };
    }
  } else limits.push("no diagnostic evidence envelope supplied: target, artifact and runtime observations are unknown");
  if (result.inputValidity !== "valid") limits.push(`captured source validity is ${result.inputValidity}`);
  if (result.cleanup !== "confirmed") limits.push("stage cleanup state is unknown and remains the workflow owner's concern");
  if (eligibility.mode === "off") return { ...base, reason: eligibility.reasons[0] ?? "consumer-off", coverage: { ...base.coverage, limits } };

  const evidence: EvidenceItem[] = [];
  const logPath = boundLog(run, failed);
  if (!logPath) return { ...base, reason: "stage-log-unbound" };
  const log = boundedTail(logPath, Math.min(LOG_WINDOW, Math.floor(runtime.settings.legacy.evidenceBytes / 2)));
  if (log) {
    base.evidence = { logPath: result.log, logDigest: log.digest, bytes: log.bytes, totalBytes: log.totalBytes, windowTruncated: log.truncated, envelope: envelope ? "supplied" : "absent" };
    if (log.truncated) limits.push(`combined stage log bounded to the final ${LOG_WINDOW} bytes`);
    evidence.push({ id: "stage:log", text: log.text, sourceDigest: log.digest, provenance: "captured", trust: "untrusted" });
  } else { unavailable.push("stage-log"); limits.push("the recorded combined stage log could not be read"); }
  const stageFacts = { id: failed.id, operation: run.binding.recipe.stages.find(stage => stage.id === failed.id)?.operation ?? null,
    state: failed.state, exitCode: result.exitCode, cleanup: result.cleanup, inputValidity: result.inputValidity,
    detail: result.detail.slice(0, 1000), startedAt: result.startedAt, endedAt: result.endedAt };
  evidence.push({ id: "stage:facts", text: JSON.stringify(stageFacts), sourceDigest: digest(stageFacts), provenance: "captured", trust: "trusted" });
  if (envelope) {
    const bound = { target: envelope.target, artifact: base.binding.artifact, observations: envelope.observations ?? [] };
    evidence.push({ id: "device:envelope", text: JSON.stringify(bound), sourceDigest: digest(bound), provenance: "supplied", trust: "untrusted" });
  }
  if (!evidence.length) return { ...base, reason: "no-assessable-evidence", coverage: { ...base.coverage, limits } };

  limits.push("target identity and observations are caller-supplied; this advice does not independently prove device state");
  if (evidence.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0) > runtime.settings.legacy.evidenceBytes)
    return { ...base, reason: "evidence-budget-exceeded", coverage: { ...base.coverage, limits } };
  const evidenceIds = evidence.map(item => item.id);
  const questions: QuestionInstance[] = [{ name: "diagnosis", definitionId: "runtime.diagnostic-match/1", consumerId: "DL05",
    evidenceIds, candidates: DECISION_QUESTIONS["runtime.diagnostic-match/1"]!.options!.map(id => ({ id, description: id.replaceAll("-", " ") })) }];
  const probes = envelope?.probes ?? [];
  if (probes.length) {
    questions.push({ name: "probe", definitionId: "runtime.next-probe/1", consumerId: "DL05", evidenceIds,
      candidates: probes.map(probe => ({ id: probe.id, description: probe.description })) });
  } else limits.push("no eligible read-only probe supplied: no next-probe suggestion is possible");
  const coverage: DecisionCoverage = { captured: evidence.length, omitted: [], truncated: Boolean(log?.truncated), unavailable, limits };
  const evidenceDigest = digest(evidence.map(item => ({ id: item.id, sourceDigest: item.sourceDigest })));
  const outcome = await runtime.ask({ consumerId: "DL05", entryKind: "workflow-observe", eventId: `device:${run.id}:${failed.id}:${evidenceDigest}`, scope,
    subject: { digest: evidenceDigest, revision: String(run.binding.taskVersion), environment: options.environment },
    evidence, coverage, questions, runId: run.id,
    eligibilityDigest: digest({ probes: probes.map(probe => probe.id), target: envelope?.target ?? null }),
    policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  if (!outcome.delivered) return { ...base, mode: outcome.mode, reason: outcome.reason, coverage, decision };
  const currentLog = boundLog(run, failed);
  if (!validateInputs(run.binding.recipe) || currentLog !== logPath || !log ||
      boundedTail(logPath, Math.min(LOG_WINDOW, Math.floor(runtime.settings.legacy.evidenceBytes / 2)))?.digest !== log.digest)
    return { ...base, reason: "evidence-changed", coverage, decision };
  const diagnosis = interpretChoice(outcome.answers["diagnosis"]);
  const probe = interpretChoice(outcome.answers["probe"]);
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true, coverage, decision,
    diagnosis: diagnosis.value ? { category: diagnosis.value, confidence: diagnosis.confidence, margin: diagnosis.margin } : null,
    unknownDiagnosis: outcome.answers["diagnosis"]?.status === "unknown",
    nextProbe: probe.value ? { id: probe.value, confidence: probe.confidence } : null };
}
