import { restartCommandGuardian } from "./command-guardian-restart.ts";
import { recoverCommandOwner } from "./command-owner-recovery.ts";
import { captureCompletionTarget, deliverCommandCompletion } from "./completion-delivery.ts";
import { managedProviderDirectory, listProviderJobs } from "./provider-job-store.ts";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { digest, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { submitProviderJob, submitProviderFollowUp } from "./provider-job.ts";
import { observeCommand, observeProviderEvents, waitCommand, cancelCommand } from "./process-owner.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { providerDoctor } from "./provider-doctor.ts";
import type { NativeProvider } from "./provider-binding.ts";
import { providerResultSummary } from "./provider-result-summary.ts";

export const COMMAND_RECOVERY_COMMANDS = ["command-resume-cleanup", "command-recover", "command-reconcile"];

export const PROVIDER_COMMANDS = [...COMMAND_RECOVERY_COMMANDS, "provider-resume-cleanup", "provider-recover", "provider-deliver", "provider-list", "provider-submit", "provider-status", "provider-events", "provider-wait", "provider-cancel", "provider-follow-up", "provider-reconcile", "provider-doctor"];

/** File-backed assignments avoid shell quoting and keep private prompts out of argv. */
export async function providerJobCommand(command: string, args: string[]) {
  if (!PROVIDER_COMMANDS.includes(command)) throw new Error("Unknown provider command");
  if (command === "provider-deliver") {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { directory: { type: "string" }, digest: { type: "string" }, retry: { type: "boolean" } } });
    const result = deliverCommandCompletion(text(values.directory, "job directory"), text(values.digest, "request digest"), values.retry ?? false);
    return { result, exitCode: result.state === "queued" || result.state === "not-requested" ? 0 : 2 };
  }
  if (command === "provider-list") {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { workspace: { type: "string" }, limit: { type: "string" } } });
    return { result: listProviderJobs(text(values.workspace, "workspace"), Number(values.limit ?? 100)), exitCode: 0 };
  }
  if (command === "provider-doctor") {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: Object.fromEntries(["provider", "model", "effort", "executable", "config"].map(name => [name, { type: "string" as const }])) });
    const provider = text(values.provider, "provider", 64) as NativeProvider;
    const options = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "provider")) as { model?: string; effort?: string; executable?: string; config?: string };
    const result = providerDoctor(provider, options);
    return { result, exitCode: result.status === "passed" ? 0 : 1 };
  }
  const genericRecovery = COMMAND_RECOVERY_COMMANDS.includes(command);
  if (genericRecovery) command = command.replace("command-", "provider-");
  const names = command === "provider-submit" ? ["directory", "request", "completion-executable"]
    : ["directory", "digest", ...(command === "provider-follow-up" ? ["request"] : []),
      ...(command === "provider-events" ? ["after", "limit"] : []), ...(command === "provider-wait" ? ["milliseconds"] : []),
      ...(["provider-cancel", "provider-recover", "provider-resume-cleanup"].includes(command) ? ["authority"] : [])];
  const { values } = parseArgs({ args, strict: true, allowPositionals: false,
    options: Object.fromEntries(names.map(name => [name, { type: "string" as const }])) });
  let directory = values.directory ? resolve(values.directory) : undefined;
  if (command === "provider-submit") {
    const request = object(JSON.parse(narrativeFile(process.cwd(), text(values.request, "provider request file"))));
    const allowed = ["id", "provider", "workspace", "additionalRoots", "prompt", "model", "effort", "executable", "config", "conversationId", "requiredTools", "deadlineMs", "idleTimeoutMs", "outputLimit", "access", "registry", "assignment"];
    if (Object.keys(request).some(key => !allowed.includes(key))) throw new Error("Unknown provider request field");
    const completion = values["completion-executable"] ? captureCompletionTarget(values["completion-executable"]) : undefined;
    directory ??= managedProviderDirectory(text(request.workspace, "workspace"), text(request.id, "provider job id", 256));
    const result = submitProviderJob(directory, request as unknown as Parameters<typeof submitProviderJob>[1], completion);
    return { result: { status: "submitted", ...result }, exitCode: 0 };
  }
  if (!directory) throw new Error("Provider job directory required");
  const hash = text(values.digest, "provider request digest", 80);
  const request = object(JSON.parse(narrativeFile(directory, "request.json")));
  if (request.version !== 1 || digest(request) !== hash || (!genericRecovery && (!request.provider || !request.assignment || request.runtime === undefined))) throw new Error("Provider job request identity mismatch");
  if (command === "provider-resume-cleanup") return { result: await restartCommandGuardian(directory, hash, text(values.authority, "cleanup restart authority")), exitCode: 0 };
  if (command === "provider-recover") {
    const result = recoverCommandOwner(directory, hash, text(values.authority, "recovery authority"));
    const reconciliation = reconcileCommand(directory, hash);
    return { result: { ...result, reconciliation }, exitCode: result.receipt?.state === "succeeded" ? 0 : 1 };
  }
  if (command === "provider-reconcile") return { result: reconcileCommand(directory, hash), exitCode: 0 };
  if (command === "provider-follow-up") {
    const next = object(JSON.parse(narrativeFile(process.cwd(), text(values.request, "provider follow-up file"))));
    if (Object.keys(next).some(key => !["id", "prompt", "directory"].includes(key))) throw new Error("Unknown provider follow-up field");
    const id = text(next.id, "follow-up id", 256);
    const followDirectory = next.directory === undefined
      ? managedProviderDirectory(text(object(request.operation).cwd, "workspace"), id) : resolve(text(next.directory, "follow-up directory"));
    const result = submitProviderFollowUp(directory, hash, { id, prompt: text(next.prompt, "follow-up assignment", 400000), directory: followDirectory });
    return { result: { status: "submitted", ...result }, exitCode: 0 };
  }
  if (command === "provider-events") return { result: observeProviderEvents(directory, hash, Number(values.after ?? 0), Number(values.limit ?? 100)), exitCode: 0 };
  if (command === "provider-cancel") cancelCommand(directory, hash, text(values.authority, "cancellation authority"));
  const milliseconds = Number(values.milliseconds ?? 30000);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 30000) throw new Error("Provider wait must be within 0..30000 ms");
  const result = command === "provider-wait" ? await waitCommand(directory, hash, milliseconds) : observeCommand(directory, hash);
  return { result: { ...result, provider: providerResultSummary(result.receipt) }, exitCode: result.state !== "terminal" ? 2 : result.receipt?.state === "succeeded" ? 0 : 1 };
}
