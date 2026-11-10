import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { prepareCommand, dispatchPreparedChecks } from "./cli.ts";
import { withCoworkBinding, type CoworkBinding } from "./cowork-binding.ts";
import { checkRunRoot } from "./check-run.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { inspectCheckRun } from "./check-status.ts";
import { checkSummary } from "./check-summary.ts";
import { checkOutput } from "./check-output.ts";
import { requestCheckCancellation } from "./check-cancellation.ts";

export function coworkCheckStart(workspace: string, input: CoworkBinding & { candidate: Array<{ path: string; expected: string }> }) {
  return withCoworkBinding(workspace, input, true, ({ assertPaths }) => {
    assertPaths(input.candidate.map(item => item.path));
    const prepared = prepareCommand(["--stage", "pre-commit", "--mode", "impacted", "--base-ref", "HEAD", "--detach",
      "--decision-task", input.task_id, "--decision-revision", String(input.expected_version),
      ...input.candidate.flatMap(item => ["--changed-path", item.path])], workspace,
      fileURLToPath(new URL("../assets/packs/", import.meta.url)), "check", { session: input.session, candidate: input.candidate });
    return { status: "submitted", ...dispatchPreparedChecks(prepared) };
  });
}
export async function coworkCheckObserve(workspace: string, input: CoworkBinding & { run_id: string }, operation: string) {
  withCoworkBinding(workspace, input, operation === "check-cancel", () => {});
  if (!/^[a-f0-9-]{36}$/u.test(input.run_id)) throw new Error("cowork-check-id-invalid");
  const directory = join(checkRunRoot(), input.run_id);
  const dispatch = JSON.parse(narrativeFile(directory, "dispatch.json")) as { root?: string; taskBinding?: { taskId?: string } };
  if (dispatch.root !== realpathSync(workspace) || dispatch.taskBinding?.taskId !== input.task_id)
    throw new Error("cowork-check-binding-mismatch");
  if (operation === "check-output") return await checkOutput(input.run_id, workspace);
  const observed = inspectCheckRun(input.run_id);
  if (operation === "check-cancel" && observed.state !== "terminal") {
    requestCheckCancellation(directory, input.run_id, input.session);
    return { run_id: input.run_id, status: "cancellation-requested" };
  }
  return observed.state === "terminal" ? { ...observed, result: checkSummary(observed.result) } : observed;
}
