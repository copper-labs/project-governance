import type { CompletionTarget } from "./completion-delivery.ts";
import { providerCommand } from "./provider-command.ts";
import { providerRuntime } from "./provider-runtime.ts";
import { submitCommand } from "./process-owner.ts";
import { providerFollowUp } from "./provider-follow-up.ts";
import { digest } from "./core.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileCommand } from "./command-recovery.ts";

/** Explicit parent submission, never a governance check or automatic model selection. */
export function submitProviderJob(directory: string, request: Parameters<typeof providerCommand>[0], completion?: CompletionTarget) {
  if (!request.assignment) throw new Error("Provider jobs require a structured parent assignment");
  const runtime = providerRuntime(request.workspace);
  const command = providerCommand(request, directory);
  return submitCommand(directory, { ...command, runtime, ...(completion ? { completion } : {}) });
}

/** Resume a verified native session with its original authority and installed runtime identity. */
export function submitProviderFollowUp(parentDirectory: string, parentDigest: string, next: { id: string; prompt: string; directory: string }) {
  const plan = providerFollowUp(parentDirectory, parentDigest, next);
  if (!plan.command.assignment) throw new Error("Provider continuation requires the original structured assignment");
  const prior = JSON.parse(readFileSync(join(parentDirectory, "request.json"), "utf8"));
  if (digest(prior) !== parentDigest || prior.runtime === undefined) throw new Error("Provider parent runtime binding missing or changed");
  const runtime = providerRuntime(plan.command.operation.cwd);
  if (digest(runtime) !== digest(prior.runtime)) throw new Error("Provider runtime changed since parent assignment");
  reconcileCommand(parentDirectory, parentDigest);
  return submitCommand(next.directory, { ...plan.command, runtime, parent: plan.parent, ...(prior.completion ? { completion: prior.completion } : {}) });
}
