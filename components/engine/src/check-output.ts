import { realpathSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { digest, fileDigest, object } from "./core.ts";
import { checkRunRoot } from "./check-run.ts";
import { inspectCheckRun, readCheckRecord } from "./check-status.ts";
import { checkSummary } from "./check-summary.ts";
import { observeCommand } from "./process-owner.ts";
import { DecisionRuntime, type DecisionRuntimeOptions } from "./decision-runtime.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { decisionTaskContext, decisionTaskPurpose } from "./decision-task-context.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { contextStateRoot } from "./context-command.ts";
import { outputSelection, captureOutput } from "./decision-output-advice.ts";
import { recordEntryExposure } from "./decision-episodes.ts";
import type { DecisionOptions } from "./decisions.ts";

/** Explicit raw-output delivery, also reached by foreground check --summary. Status stays passive. */
export async function checkOutput(id: string, workspace: string, options: DecisionRuntimeOptions & { root?: string } = {}) {
  const root = realpathSync(options.root ?? checkRunRoot()), directory = join(root, id);
  const observed = inspectCheckRun(id, root);
  if (observed.state !== "terminal") return observed;
  const result = object(observed.result), intent = readCheckRecord(join(directory, "run.json"));
  if (realpathSync(directory) !== directory || intent?.root !== realpathSync(workspace) || result.run_directory !== directory)
    throw new Error("Check output workspace binding differs");
  const dispatch = readCheckRecord(join(directory, "dispatch.json"));
  if (dispatch && (dispatch.id !== id || dispatch.root !== workspace || digest(dispatch.plan) !== digest(intent.plan)))
    throw new Error("Check output dispatch binding differs");
  const task = dispatch?.decisionContext ? decisionTaskContext(dispatch.decisionContext, workspace) : null;
  const scope = task ? resolveDecisionScope(workspace, {}, task) : null;
  const settings = loadProfileDecisionSettings(workspace), stateRoot = contextStateRoot(workspace);
  const runtime = new DecisionRuntime(settings, stateRoot, options);
  const outputs = [], decisions: string[] = [];
  let eligible = 0;
  for (const rawPack of result.results as unknown[]) {
    const pack = object(rawPack), packDirectory = join(directory, digest(pack.pack_id).slice(7));
    for (const raw of pack.commands as unknown[]) {
      const command = object(raw);
      if (!command.request_digest || !command.command_receipt) continue;
      eligible++;
      if (outputs.length >= 8) continue;
      const retained = object(command.command_receipt);
      const commandDirectory = dirname(String(retained.log));
      if (dirname(commandDirectory) !== packDirectory || !/^command-\d+$/u.test(commandDirectory.split("/").at(-1)!) ||
          realpathSync(commandDirectory) !== commandDirectory || realpathSync(String(retained.log)) !== retained.log)
        throw new Error("Check output is not a bound native stream");
      const request = readCheckRecord(join(commandDirectory, "request.json"));
      if (!request || digest(request) !== command.request_digest || object(request.operation).cwd !== workspace ||
          request.id !== `${id}:${pack.pack_id}:${commandDirectory.split("-").at(-1)}`) throw new Error("Check command binding differs");
      const native = observeCommand(commandDirectory, String(command.request_digest));
      if (native.state !== "terminal" || !native.receipt || digest(native.receipt) !== digest(retained)) throw new Error("Check native result changed");
      const before = captureOutput(native.receipt.log);
      const selection = await outputSelection(runtime, native.receipt, scope, {
        task: task ? decisionTaskPurpose(task) : "Task context unavailable; preserve ordinary output.",
        eventId: `check-output:${id}:${command.request_digest}`, policyDigest: settings.configDigest,
        environment: "check-output", revision: task?.revision ?? "unbound" });
      const after = captureOutput(native.receipt.log);
      if (digest(before) !== digest(after) || digest(readCheckRecord(join(directory, "result.json"))) !== digest(result) ||
          loadProfileDecisionSettings(workspace).configDigest !== settings.configDigest) throw new Error("Check output changed during selection");
      if (selection.decision?.receiptId) decisions.push(selection.decision.receiptId);
      outputs.push({ pack_id: pack.pack_id, request_digest: command.request_digest, ...selection });
    }
  }
  const exposure = { reached: true, task: scope ? "bound" : "unavailable", used: null,
    outputs: outputs.map(({ selection, ...output }) => ({ requestDigest: output.request_digest, reason: output.reason,
      called: output.decision?.providerCalled ?? (output.decision ? null : false), delivered: output.delivered, deliveredBytes: selection?.bytes ?? 0,
      originalBytes: output.source.totalBytes, receiptId: output.decision?.receiptId ?? null })),
    omittedCommands: eligible - outputs.length, additionalReads: "unobserved", acceptedOutcome: "unknown",
    totalModelTokens: null, outsideEntryActivity: "unknown" };
  const episode = recordEntryExposure(stateRoot, { caller: "check-output", entryKind: "check-output", scope,
    native: { runId: id, resultDigest: digest(result), resultFileDigest: fileDigest(join(directory, "result.json")), status: result.status }, exposure, decisions });
  return { run_id: id, state: "terminal", status: result.status, result: checkSummary(result), outputs,
    coverage: { omittedCommands: eligible - outputs.length, note: "At most eight command streams are projected; complete streams remain at their original references." }, episode };
}
