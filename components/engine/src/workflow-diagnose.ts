import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { resolveDiagnosticManifest } from "./diagnostic-manifest.ts";
import { dispatchWorkflow, observeWorkflow } from "./workflow-worker.ts";
import { processFingerprint } from "./process-owner.ts";
import { validateInputs } from "./workflow-types.ts";
import { ResourceRegistry, resourceRegistryPath } from "./resources.ts";
import { observeSimulatorCleanup } from "./simulator-cleanup.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime, interpretChoice, type DecisionRuntimeOptions } from "./decision-runtime.ts";
import { contextStateRoot } from "./context-command.ts";
import { checkRunRoot } from "./check-run.ts";
import { workflowStageExcerpt } from "./decision-device-advice.ts";
import { readPilotAssignment, recordDecisionEpisode } from "./decision-episodes.ts";
import type { DiagnosticEpisode, DiagnosticOwner } from "./diagnostic-types.ts";

/** A failed liveness observation is not evidence that another coordinator may be replaced. */
function ownerAlive(owner: DiagnosticOwner): boolean {
  if (owner.host !== hostname()) return true;
  const fingerprint = processFingerprint(owner.pid);
  if (fingerprint) return fingerprint === owner.fingerprint;
  try { process.kill(owner.pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

/** Reuse ordinary child workers and their ownership. This coordinator grants no actions. */
export async function diagnoseWorkflow(database: string, rawManifest: unknown,
  options: DecisionRuntimeOptions & { workersDirectory?: string; registryPath?: string; assignmentPath?: string } = {}) {
  if (!statSync(database).isFile()) throw new Error("Existing workflow ledger required");
  const startedAt = Date.now(), store = new WorkflowStore(database), registryPath = options.registryPath ?? resourceRegistryPath();
  let registry: ResourceRegistry;
  try { registry = new ResourceRegistry(registryPath); } catch (error) { store.close(); throw error; }
  const owner: DiagnosticOwner = { token: randomUUID(), pid: process.pid, fingerprint: processFingerprint(process.pid) ?? "", host: hostname() };
  if (!owner.fingerprint) { registry.close(); store.close(); throw new Error("Diagnostic coordinator identity unavailable"); }
  let episode: DiagnosticEpisode | null = null;
  try {
    const parentId = (rawManifest as { parentRunId?: string })?.parentRunId;
    if (!parentId) throw new Error("Parent workflow required");
    const parent = store.read(parentId), manifest = resolveDiagnosticManifest(rawManifest, parent), workspace = parent.binding.recipe.workspace;
    const scope = { workspace, taskId: parent.binding.taskId, taskRevision: String(parent.binding.taskVersion) };
    let assignment: ReturnType<typeof readPilotAssignment> | null = null, collectionError: string | null = null;
    if (options.assignmentPath) {
      try { assignment = readPilotAssignment(resolve(workspace, options.assignmentPath), scope, startedAt); }
      catch { collectionError = "assignment-invalid-or-unavailable"; }
    }
    const parentStages = store.stages(parent.id), failed = parentStages.find(stage => stage.id === manifest.stageId);
    if (parent.state !== "failed" || failed?.state !== "failed" || failed.result?.inputValidity !== "valid" || parentStages.some(stage => ["pending", "running", "unknown"].includes(stage.state) || stage.result?.cleanup === "unknown") ||
        registry.inspect().some(lease => lease.operation === parent.id && lease.state === "held")) throw new Error("Diagnostic parent failure and cleanup must be reconciled");
    const initial: DiagnosticEpisode = { version: 1, id: manifest.id, requestDigest: manifest.requestDigest, parentRunId: parent.id,
      stageId: manifest.stageId, catalogDigest: manifest.catalogDigest, deadline: manifest.deadline, owner: null, revision: 0,
      attempts: [], decisions: [], closedReason: null, createdAt: new Date().toISOString() };
    const entrySettings = loadProfileDecisionSettings(workspace);
    const entryEligibility = new DecisionRuntime(entrySettings, contextStateRoot(workspace), options).eligibility("DL05");
    const report = (record: DiagnosticEpisode, persisted: boolean, refusalReason: string | null = null) => {
      const result = { version: 1, episode: record, persisted, refusalReason, parent: { id: parent.id, state: parent.state },
        children: record.attempts.map(attempt => { const run = store.read(attempt.childRunId); return { ...attempt, run, stages: store.stages(run.id) }; }),
        authority: "read-only diagnosis; parent failure unchanged; no repair or verification claim" };
      if (!options.assignmentPath) return result;
      if (collectionError || !assignment) return { ...result, collection: { status: "failed", reason: collectionError } };
      try {
        return { ...result, collection: recordDecisionEpisode(contextStateRoot(workspace), { ...assignment, caller: "workflow-diagnose", entryKind: "workflow-diagnose",
          native: { runId: parent.id, runDigest: digest(parent), stagesDigest: digest(parentStages), eventIds: [], eventsDigest: digest([]) },
          exposure: { mode: entryEligibility.mode, configuredMode: entrySettings.mode, effect: entryEligibility.effect,
            configuredEffect: entrySettings.consumers.DL05.effect, configDigest: entrySettings.configDigest,
            providerUse: entryEligibility.providerUse, eligibilityReasons: entryEligibility.reasons,
            reason: refusalReason ?? record.closedReason, persisted, probes: record.attempts,
            delivered: record.attempts.slice(prior?.attempts.length ?? 0).some(attempt => attempt.method === "jev"), elapsedMs: Date.now() - startedAt },
          decisions: record.decisions }) };
      } catch (error) { return { ...result, collection: { status: "failed", reason:
        error instanceof Error && error.message === "episode-id-already-used" ? "episode-id-already-used" : "episode-recording-unavailable" } }; }
    };
    const prior = store.diagnosticRead(manifest.id);
    if (prior && prior.requestDigest !== manifest.requestDigest) throw new Error("Diagnostic identity changed; a catalog edit cannot reset the allowance");
    const observeTarget = () => manifest.target.kind === "workspace" ? { kind: "workspace", id: realpathSync(workspace) }
      : observeSimulatorCleanup([`ios-simulator:${manifest.target.id}`]);
    let entryTarget: Awaited<ReturnType<typeof observeTarget>> = null;
    // A refused first invocation consumes no episode and cannot migrate the ledger. Existing children still need reconciliation.
    if (!prior) {
      if (entryEligibility.effect !== "choose-read") return report(initial, false, "diagnostic-effect-disabled");
      if (options.signal?.aborted || Date.now() >= manifest.deadline) return report(initial, false, "deadline-or-cancelled-before-entry");
      entryTarget = await observeTarget();
      if (!entryTarget) return report(initial, false, "target-unavailable");
      if (options.signal?.aborted || Date.now() >= manifest.deadline) return report(initial, false, "deadline-or-cancelled-before-entry");
    }
    if (!prior?.closedReason) for (const probe of manifest.probes) store.validateWorkflowBinding(probe.binding);
    episode = store.claimDiagnostic(initial, owner, ownerAlive);
    const close = (reason: string) => { episode = store.finishDiagnostic(episode!.id, owner.token, episode!.revision, reason); };
    const workers = options.workersDirectory ?? join(checkRunRoot(), "..", "workflows");
    let activeDirectory: string | null = null;
    while (!episode.closedReason) {
      const last = episode.attempts.at(-1);
      if (last) {
        let child = store.read(last.childRunId);
        if (["queued", "running", "reconciling"].includes(child.state)) {
          // The persisted absolute deadline is part of worker identity; resume cannot renew it.
          if (child.state === "queued" && (Date.now() >= episode.deadline || options.signal?.aborted) && !existsSync(join(workers, child.id))) {
            store.blockUnstarted(child.id, digest(child.binding), "diagnostic stopped before dispatch");
            close("deadline-or-cancelled-before-dispatch"); break;
          }
          activeDirectory = dispatchWorkflow(database, child.id, workers, registryPath, { absoluteDeadline: episode.deadline, outputLimit: 32768 });
          for (;;) {
            child = store.read(child.id);
            if (!["queued", "running", "reconciling"].includes(child.state)) break;
            if (options.signal?.aborted || Date.now() >= episode.deadline) {
              if (!child.cancelRequested) store.cancel(child.id, "host:diagnostic-stop");
            }
            if (Date.now() > episode.deadline + 60000) { close("child-cleanup-still-owned"); break; }
            const observation = observeWorkflow(activeDirectory);
            if (observation.worker === "stopped") { close("child-owner-unresolved"); break; }
            await new Promise(resolveWait => setTimeout(resolveWait, 100));
          }
          if (episode.closedReason) break;
          child = store.read(child.id);
        }
        if (child.state !== "succeeded" || store.stages(child.id).some(stage => stage.result?.cleanup !== "confirmed") ||
            registry.inspect().some(lease => lease.operation === child.id && lease.state === "held")) { close("child-failed-or-unresolved"); break; }
      }
      if (episode.attempts.length >= 2) {
        const observations = episode.attempts.slice(-2).map(attempt => { const run = store.read(attempt.childRunId);
          return store.stages(run.id).map(stage => workflowStageExcerpt(run, stage)?.text ?? null); });
        if (digest(observations[0]) === digest(observations[1])) { close("unchanged-observations"); break; }
      }
      if (options.signal?.aborted) { close("cancelled"); break; }
      if (Date.now() >= episode.deadline) { close("deadline"); break; }
      if (episode.attempts.length >= 3) { close("probe-limit"); break; }
      if (digest(store.read(parent.id)) !== digest(parent) || !validateInputs(parent.binding.recipe)) { close("stale-parent"); break; }
      const target = entryTarget ?? await observeTarget();
      entryTarget = null;
      if (!target) { close("target-unavailable"); break; }
      const eligible = manifest.probes.filter(probe => !episode!.attempts.some(attempt => attempt.probeId === probe.id || attempt.recipeDigest === probe.binding.recipeDigest))
        .filter(probe => { try { store.validateWorkflowBinding(probe.binding); return validateInputs(probe.binding.recipe); } catch { return false; } });
      if (!eligible.length) { close("no-eligible-probes"); break; }
      const baseline = manifest.baselineOrder.map(id => eligible.find(probe => probe.id === id)).find(Boolean) ?? null;
      const settings = loadProfileDecisionSettings(workspace), runtime = new DecisionRuntime(settings, contextStateRoot(workspace), options), eligibility = runtime.eligibility("DL05");
      let selected = baseline, method: "baseline" | "jev" = "baseline", receiptId: string | null = null;
      if (eligibility.effect !== "choose-read") { close("diagnostic-effect-disabled"); break; }
      if (!manifest.exactBaseline && eligibility.providerUse === "eligible") {
        const evidence = { parent: { id: parent.id, state: parent.state, stage: failed.id, result: failed.result, excerpt: workflowStageExcerpt(parent, failed)?.text ?? null }, target,
          attempts: episode.attempts.map(attempt => { const run = store.read(attempt.childRunId); return { probe: attempt.probeId,
            stages: store.stages(run.id).map(stage => ({ id: stage.id, state: stage.state, excerpt: workflowStageExcerpt(run, stage)?.text ?? null })) }; }) };
        const content = JSON.stringify(evidence);
        const decisionRuntime = new DecisionRuntime(settings, contextStateRoot(workspace), { ...options,
          signal: AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(Math.min(settings.legacy.deadlineMs, Math.max(1, episode.deadline - Date.now())))]) });
        const outcome = await decisionRuntime.ask({ consumerId: "DL05", entryKind: "workflow-diagnose", scope,
          eventId: `diagnostic:${episode.id}:${episode.attempts.length}`, subject: { digest: digest(evidence), revision: scope.taskRevision, environment: "read-only-diagnosis" },
          evidence: [{ id: "observations", text: content, sourceDigest: digest(evidence), provenance: "captured", trust: "untrusted" }],
          coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: ["post-cleanup observations; diagnosis is not repair"] },
          policyDigest: settings.configDigest, eligibilityDigest: digest(eligible), questions: [{ name: "probe", definitionId: "runtime.next-probe/2", consumerId: "DL05", evidenceIds: ["observations"],
            candidates: eligible.map(probe => ({ id: probe.id, description: probe.description })) }] });
        receiptId = outcome.receiptId;
        if (receiptId) episode = store.recordDiagnosticDecision(episode.id, owner.token, episode.revision, receiptId);
        if (eligibility.mode === "auto" && outcome.delivered) { selected = eligible.find(probe => probe.id === interpretChoice(outcome.answers.probe).value) ?? null; method = "jev"; }
        else if (eligibility.mode === "auto" && Object.keys(outcome.answers).length) { close("selection-unknown"); break; }
      }
      if (Date.now() >= episode.deadline) { close("deadline"); break; }
      if (!selected) { close("compact-handoff"); break; }
      // Re-read permissions, target and input facts after inference and before atomic submission.
      const nowSettings = loadProfileDecisionSettings(workspace);
      if (nowSettings.configDigest !== settings.configDigest || options.signal?.aborted) { close("configuration-changed-or-cancelled"); break; }
      if (!validateInputs(selected.binding.recipe) || !validateInputs(parent.binding.recipe) ||
          (manifest.target.kind === "ios-simulator" && !await observeSimulatorCleanup([`ios-simulator:${manifest.target.id}`]))) { close("source-or-target-changed"); break; }
      if (loadProfileDecisionSettings(workspace).configDigest !== settings.configDigest || options.signal?.aborted) { close("configuration-changed-or-cancelled"); break; }
      try { episode = store.reserveDiagnosticProbe(episode.id, owner.token, episode.revision, selected, { method, decisionReceiptId: receiptId }); }
      catch { close("pre-dispatch-admission-changed"); break; }
    }
    return report(episode, true);
  } finally {
    // Children retain their own runtime/resource owners even when this observer disappears.
    if (episode?.owner?.token === owner.token) {
      try { store.finishDiagnostic(episode.id, owner.token, episode.revision, null); } catch { /* A concurrent owner change must remain fenced. */ }
    }
    registry.close(); store.close();
  }
}

/** Explicit CLI entry cannot create grants; normal status/wait never reaches this dispatcher. */
export async function workflowDiagnoseCommand(args: string[], options: DecisionRuntimeOptions = {}) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    database: { type: "string" }, "probe-manifest": { type: "string" }, "pilot-assignment": { type: "string" },
  } });
  if (!values.database || !values["probe-manifest"]) throw new Error("Existing ledger and probe manifest required");
  return diagnoseWorkflow(values.database, JSON.parse(narrativeFile(process.cwd(), values["probe-manifest"])),
    { ...options, ...(values["pilot-assignment"] ? { assignmentPath: values["pilot-assignment"] } : {}) });
}
