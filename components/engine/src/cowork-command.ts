import { workContext } from "../../harness/src/store/location.ts";
import { coworkCommit, coworkCommitStatus } from "./cowork-commit.ts";
import { coworkCheckStart, coworkCheckObserve } from "./cowork-checks.ts";
import { coworkFileApply, coworkFileRead, type CoworkEdit } from "./cowork-files.ts";
import { withCoworkBinding, type CoworkBinding } from "./cowork-binding.ts";
import { coworkTaskResume, coworkTaskStart } from "./cowork-tasks.ts";
import { readCoworkStdin } from "./cowork-request.ts";
import { registerCoworkProject } from "./cowork-registration.ts";
import { skillReadCommand } from "./skill-read-command.ts";
import { contextRouteCommand } from "./context-route-command.ts";

/** The only public inputs are operation name and bounded stdin; never a caller's argv or environment. */
export async function coworkCommand(args: string[], workspace: string) {
  if (args.length !== 1) throw new Error("cowork-operation-required");
  const operation = args[0]!;
  if (process.env.GOVERNANCE_COWORK_LOCATOR && workContext(workspace).locator !== process.env.GOVERNANCE_COWORK_LOCATOR)
    throw new Error("cowork-worktree-identity-changed");
  const input = await readCoworkStdin(operation);
  if (operation === "register") return registerCoworkProject(workspace, input.label as string);
  if (operation === "task-start") return coworkTaskStart(workspace, input as unknown as Parameters<typeof coworkTaskStart>[1]);
  if (operation === "task-resume") return coworkTaskResume(workspace, input as unknown as Parameters<typeof coworkTaskResume>[1]);
  const binding = input as unknown as CoworkBinding;
  if (operation === "commit") return coworkCommit(workspace, input as unknown as Parameters<typeof coworkCommit>[1]);
  if (operation === "commit-status") return coworkCommitStatus(workspace, input as unknown as Parameters<typeof coworkCommitStatus>[1]);
  if (operation === "check-start") return coworkCheckStart(workspace, input as unknown as Parameters<typeof coworkCheckStart>[1]);
  if (["check-status", "check-output", "check-cancel"].includes(operation))
    return coworkCheckObserve(workspace, input as unknown as Parameters<typeof coworkCheckObserve>[1], operation);
  if (operation === "file-read") return withCoworkBinding(workspace, binding, false, ({ assertPaths }) => {
    assertPaths([input.path as string]);
    return coworkFileRead(workspace, input.path as string, input.offset as number | undefined, input.length as number | undefined);
  });
  if (operation === "file-apply") return withCoworkBinding(workspace, binding, true, ({ recordWrites }) =>
    coworkFileApply(workspace, input.edits as CoworkEdit[], recordWrites));
  if (operation === "task-show") return withCoworkBinding(workspace, binding, false, ({ store }) => ({
    ok: true, task: store.readTask(binding.task_id), checkpoint: store.latestCheckpoint(binding.task_id), usage: store.usageTotals(binding.task_id), evidence: store.listEvidence(binding.task_id),
  }));
  if (operation === "skill-read") return withCoworkBinding(workspace, binding, false, () => skillReadCommand([`--path=${input.path as string}`]));
  if (operation === "context") {
    withCoworkBinding(workspace, binding, true, () => {});
    return contextRouteCommand([`--task=${input.question as string}`, "--retrieval", input.retrieval as string,
      "--decision-task", binding.task_id, "--revision", String(binding.expected_version)], workspace, undefined, undefined, { session: binding.session });
  }
  if (operation === "task-checkpoint") return coworkCheckpoint(workspace, binding, input);
  throw new Error("cowork-operation-not-implemented");
}

export function coworkCheckpoint(workspace: string, binding: Parameters<typeof withCoworkBinding>[1], input: Record<string, unknown>) {
  return withCoworkBinding(workspace, binding, true, ({ store, attemptId }) => {
    const task = store.readTask(binding.task_id)!;
    if (task.items.some(item => !item.revoked && item.kind === "constraint" && item.body === "deny:record"))
      throw new Error("cowork-task-record-denied");
    const evidenceIds = new Set(store.listEvidence(binding.task_id).map(item => item.evidenceId));
    if ((input.evidence as string[]).some(id => !evidenceIds.has(id)))
      throw new Error("cowork-checkpoint-evidence-id-required-use-task-show-not-run-id");
    // The bound attempt has already been checked; checkpoints retain that original attempt identity.
    return { ok: true, checkpoint: store.checkpoint(binding.task_id, { summary: input.summary as string,
      next: input.next as string, evidenceIds: input.evidence as string[], subject: null, attemptId }) };
  });
}
