import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { parsePlanReference, type PlanReference } from "../../harness/src/model/plan-reference.ts";
import { decodePlanBytes, normalizedPlanContent, parseImplementationPlan, planBytesDigest } from "./implementation-plan.ts";
import { inspectImplementationBatch } from "./plan-progress.ts";
import { worktreeBytes, ValidationSubject, type ChangeScope } from "./change-subject.ts";
import { historicalPlanProofFindings } from "./plan-proof.ts";
import { checkRunRoot } from "./check-run.ts";
import { readCheckRecord } from "./check-status.ts";
import type { Packs } from "./pack-configuration.ts";
import { digest } from "./core.ts";
import { readWorkflowFacts } from "./workflow-store.ts";

/** Engine parses the actual plan; continuity only stores its small typed reference. */
export function resolvePlanReference(workspace: string, path: string, batch: string): PlanReference {
  const source = worktreeBytes(realpathSync(workspace), path);
  if (source.type !== "regular") throw new Error("Plan reference requires an ordinary local plan");
  const plan = parseImplementationPlan(path, decodePlanBytes(source.bytes));
  inspectImplementationBatch(plan, batch);
  return parsePlanReference({ version: 1, path, batch, definition_digest: planBytesDigest(normalizedPlanContent(plan)) });
}

export interface TaskFacts {
  version: 1; observed_at: string;
  association: { status: string; taskId?: string; attemptId?: string; workspaceId?: string;
    boundRevision?: number; observedRevision?: number };
  task?: Record<string, unknown>; plan?: Record<string, unknown>; checkpoint?: Record<string, unknown> | null;
  actions?: Array<Record<string, unknown>>; checks?: Array<Record<string, unknown>>;
  unavailable: string[]; omitted: string[];
}

/** Observe exact originals without creating a workspace, migrating, binding, collecting or executing. */
export function readTaskFacts(workspace: string, session: string, options: {
  expected?: { taskId: string; revision: string; attemptId?: string }; runsRoot?: string;
  deadlineAt?: number; qualifyHistoricalChecks?: boolean;
} = {}): TaskFacts {
  const observed_at = new Date().toISOString();
  const absent = (status: string): TaskFacts => ({ version: 1, observed_at, association: { status }, unavailable: [status], omitted: [] });
  if (!session || session.length > 128 || /[\x00-\x1f]/u.test(session)) return absent("session-unavailable");
  let store: Store | undefined;
  try {
    const root = realpathSync(workspace), where = workContext(root), database = defaultDbPath(root);
    if (!existsSync(database)) return absent("task-store-unavailable");
    store = new Store(database, { readOnly: true, busyTimeoutMs: 100 });
    const workspaceId = store.workspaceId(where.locator);
    if (!workspaceId) return absent("workspace-unbound");
    const attempt = store.boundAttempt(session, workspaceId);
    if (!attempt) return absent("session-unbound");
    const task = store.readTask(attempt.taskId);
    if (!task || attempt.worktree !== root || task.worktree !== root) return absent("task-workspace-mismatch");
    if (options.expected && (options.expected.taskId !== task.taskId || options.expected.revision !== String(task.version) ||
      options.expected.attemptId && options.expected.attemptId !== attempt.attemptId)) return absent("association-changed-during-preparation");
    const cursor = store.latestCursor(task.taskId);
    const facts: TaskFacts = { version: 1, observed_at, association: {
      status: task.version === attempt.taskVersion ? "associated" : "historical-bound-revision",
      taskId: task.taskId, attemptId: attempt.attemptId, workspaceId, boundRevision: attempt.taskVersion, observedRevision: task.version,
    }, task: { outcome: task.outcome, status: task.status, mode: task.mode, revision_time: task.createdAt,
      acceptance: task.items.filter(item => item.kind === "acceptance" && !item.revoked).map(({ seq, body, provenance }) => ({ seq, body, provenance })),
      acceptance_authority: "recorded lifecycle; host-reported, not independently authenticated", execution_permission: "not granted by this snapshot" },
      unavailable: [], omitted: ["Actions are the latest 64 recorded originals; earlier actions and uncollected results are not inspected."] };
    const checkpoint = store.latestCheckpoint(task.taskId);
    facts.checkpoint = checkpoint ? { ...checkpoint, applicability: checkpoint.taskVersion === task.version && checkpoint.attemptId === attempt.attemptId
      ? "same-revision-and-attempt" : "historical-or-other-attempt", provenance: "caller-declared summary and next action; not executed proof" } : null;
    if (!checkpoint) facts.unavailable.push("checkpoint-not-recorded");
    const actions = store.listActions(task.taskId, 64);
    const workflow = actions.length ? readWorkflowFacts(database, { workspace: root, taskId: task.taskId,
      actions: actions.map(({ actionId, taskVersion }) => ({ actionId, taskVersion })) }) : null;
    if (workflow) { facts.unavailable.push(...workflow.unavailable); facts.omitted.push(...workflow.omitted); }
    facts.actions = actions.map(action => {
      const execution = store!.execution(action.actionId);
      return { actionId: action.actionId, taskVersion: action.taskVersion, status: action.status, operation: action.operation,
        updatedAt: action.updatedAt, refusedReason: action.refusedReason, jobId: execution?.jobId ?? null,
        recordedResult: execution?.result ? { digest: digest(execution.result), state: execution.result.state ?? null,
          cleanup: execution.result.cleanup ?? null, reason: execution.result.reason ?? null } : null,
        workflowRun: workflow?.byAction.get(action.actionId) ?? null,
        resultProvenance: "recorded original only; no collection or cleanup action" };
    });
    const references = task.items.filter(item => item.kind === "plan-reference" && !item.revoked);
    if (references.length !== 1) facts.unavailable.push(references.length ? "plan-reference-ambiguous" : "plan-not-linked");
    else {
      try {
        const reference = parsePlanReference(JSON.parse(references[0]!.body));
        const source = worktreeBytes(root, reference.path);
        if (source.type !== "regular") throw new Error("ordinary plan required");
        const plan = parseImplementationPlan(reference.path, decodePlanBytes(source.bytes)), definition = planBytesDigest(normalizedPlanContent(plan));
        const linked = definition === reference.definition_digest;
        facts.plan = { status: linked ? "linked" : "definition-stale", path: reference.path, batch: reference.batch,
          recorded_definition_digest: reference.definition_digest, observed_definition_digest: definition, observed_file_digest: plan.digest };
        if (!linked) facts.unavailable.push("plan-definition-stale");
        else {
          const batch = inspectImplementationBatch(plan, reference.batch);
          facts.plan.progress = batch;
          facts.checks = [];
          for (const item of batch.items.filter(item => item.kind === "verification")) {
            for (const reference of item.evidence) {
              if (!reference || typeof reference !== "object" || (reference as Record<string, unknown>).kind !== "native-check") continue;
              const retained = reference as Record<string, unknown>, run = retained.run_id;
              const check: Record<string, unknown> = { item: item.id, reference: retained, qualification: "unknown", current_candidate_freshness: "unknown",
                task_attribution: "unknown-until-original-dispatch" };
              facts.checks.push(check);
              if (options.deadlineAt !== undefined && performance.now() >= options.deadlineAt) {
                check.qualification = "qualification-deferred-deadline"; facts.unavailable.push("check-qualification-deferred-deadline"); continue;
              }
              if (typeof run !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(run)) { check.qualification = "invalid-reference"; continue; }
              try {
                const directory = join(realpathSync(options.runsRoot ?? checkRunRoot()), run);
                if (realpathSync(directory) !== directory) throw new Error("canonical check original required");
                const intent = readCheckRecord(join(directory, "run.json")), result = readCheckRecord(join(directory, "result.json")), dispatch = readCheckRecord(join(directory, "dispatch.json"));
                if (!intent || !result) throw new Error("check originals unavailable");
                if (result.run_id !== run || digest(result) !== retained.result_digest) throw new Error("check original identity differs");
                const binding = dispatch?.taskBinding as Record<string, unknown> | undefined;
                check.task_attribution = binding?.status === "bound" && binding.taskId === task.taskId && binding.revision === retained.task_revision
                  ? "same-task-recorded-revision" : dispatch ? "unbound-or-other-task" : "original-task-binding-unavailable";
                if (options.qualifyHistoricalChecks === false || !dispatch || !(intent.scope as ChangeScope)?.records?.some(record => record.path === plan.path)) {
                  check.qualification = "original-outcome-only";
                  check.limitations = [!dispatch ? "Original dispatch and task binding are unavailable; this outcome proves no task attribution or current candidate freshness."
                    : "Detailed historical qualification is deferred to the explicit task-facts reader; this compact result proves no current candidate freshness."];
                  check.original_outcome = result.status; check.original_time = result.ended_at; check.original_result_digest = digest(result);
                  continue;
                }
                const findings = historicalPlanProofFindings({ plan, item, reference: retained,
                  subject: new ValidationSubject(root, intent.scope as ChangeScope), scope: intent.scope as ChangeScope,
                  packs: (dispatch?.packs ?? {}) as Packs, ...(options.runsRoot ? { runsRoot: options.runsRoot } : {}) });
                check.qualification = findings.some(entry => entry.severity === "blocking") ? "invalid" : findings.length ? "historical-limited" : "historical-qualified";
                check.limitations = findings;
                check.original_outcome = result.status; check.original_time = result.ended_at; check.original_result_digest = digest(result);
              } catch (error) { check.qualification = ["ENOENT", "EACCES", "EPERM"].includes(String((error as NodeJS.ErrnoException)?.code))
                ? "originals-unavailable" : "qualification-error"; }
            }
          }
        }
        if (planBytesDigest(worktreeBytes(root, reference.path).bytes) !== plan.digest) return absent("plan-changed-during-observation");
      } catch (error) { facts.unavailable.push((error as NodeJS.ErrnoException)?.code === "ENOENT" ? "plan-missing" : "plan-unavailable-or-unstructured"); }
    }
    if (store.boundAttempt(session, workspaceId)?.attemptId !== attempt.attemptId || store.readTask(task.taskId)?.version !== task.version ||
      store.latestCursor(task.taskId) !== cursor) return absent("association-changed-during-observation");
    return facts;
  } catch { return absent("task-facts-unavailable"); }
  finally { store?.close(); }
}

export const TASK_FACTS_MARKER = "Current task facts (read-only snapshot; declarations are not proof):\n";
/** Required guidance wins. Reference-only presentation reserves status without detailed history. */
export function renderTaskFacts(facts: TaskFacts, availableBytes: number, detail: "full" | "references" = "full"): string {
  const block = (value: unknown) => TASK_FACTS_MARKER + JSON.stringify(value) + "\n";
  if (detail === "full") {
    const full = block(facts);
    if (Buffer.byteLength(full) <= availableBytes) return full;
  }
  const task = facts.task ? { status: facts.task.status, mode: facts.task.mode,
    acceptance_authority: facts.task.acceptance_authority, execution_permission: facts.task.execution_permission } : undefined;
  const limitation = "Full task details were omitted to preserve required guidance and selected evidence. Read exact originals or task-facts --session <this-session>.";
  // Per-action reasons are original evidence, not a compact status reservation. Keep their
  // exact list identities and counts without making presentation grow with the history.
  const workflowNotObserved = facts.unavailable.filter(reason => reason.startsWith("workflow-not-observed-in-window:")).length;
  const reduction = {
    unavailable: ["task-facts-packet-space", ...(facts.unavailable.length ? ["unavailable-details-in-original-snapshot"] : [])],
    unavailable_summary: { original_count: facts.unavailable.length, original_digest: digest(facts.unavailable),
      workflow_not_observed_actions: workflowNotObserved, other_count: facts.unavailable.length - workflowNotObserved },
    omitted: [limitation, "Unavailable reasons and recorded limitations are summarized by count and digest; inspect the original snapshot. A workflow not observed is not proven absent or required."],
    omitted_summary: { original_count: facts.omitted.length, original_digest: digest(facts.omitted) },
  };
  const reduced = block({ version: facts.version, observed_at: facts.observed_at, association: facts.association,
    ...(task ? { task } : {}),
    plan: facts.plan ? { status: facts.plan.status, path: facts.plan.path, batch: facts.plan.batch,
      recorded_definition_digest: facts.plan.recorded_definition_digest, observed_definition_digest: facts.plan.observed_definition_digest,
      observed_file_digest: facts.plan.observed_file_digest } : null,
    checkpoint: facts.checkpoint ? { checkpointId: facts.checkpoint.checkpointId, taskVersion: facts.checkpoint.taskVersion,
      attemptId: facts.checkpoint.attemptId, applicability: facts.checkpoint.applicability, provenance: facts.checkpoint.provenance } : null,
    ...reduction });
  if (Buffer.byteLength(reduced) <= availableBytes) return reduced;
  const minimal = block({ version: facts.version, observed_at: facts.observed_at, association: facts.association,
    ...(task ? { task } : {}), ...(facts.plan ? { plan_status: facts.plan.status } : {}), ...reduction });
  return Buffer.byteLength(minimal) <= availableBytes ? minimal : "";
}
