import { dirname, resolve } from "node:path";
import { linkSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { digest, durableJson, fileDigest, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { readProviderAdmission } from "./provider-admission.ts";
import { protectedPath } from "./provider-guard.ts";
import { decisionTaskContext, type DecisionTaskContext } from "./decision-task-context.ts";
import type { CommandRequest } from "./process-owner.ts";

export interface ProviderContinuation { id: string; prompt: string; directory: string; admission?: string }
interface ContinuationRecord {
  version: 1; actionId: string; bindingDigest: string;
  binding: { parentDirectory: string; parentDigest: string; next: Omit<ProviderContinuation, "admission">;
    admissionDigest: string; taskDigest: string; assignmentClass: string };
}
function parentBinding(directory: string, hash: string, nextDirectory: string) {
  const parent = JSON.parse(narrativeFile(directory, "request.json")) as CommandRequest;
  if (digest(parent) !== hash || !parent.provider?.guard || !parent.decisionBinding?.sourceRequest) throw new Error("Guarded continuation parent differs");
  const admission = readProviderAdmission(parent.decisionBinding.sourceRequest, nextDirectory);
  if (!admission || digest(admission) !== digest(parent.decisionBinding.admission)) throw new Error("Continuation authority changed");
  return { parent, admission };
}

/** A host attests the follow-up still serves the same requirement. A worker's prose cannot do that. */
export function authorizeProviderContinuation(options: { parentDirectory: string; parentDigest: string; next: Omit<ProviderContinuation, "admission">; context: DecisionTaskContext; path: string }) {
  const { parent, admission } = parentBinding(options.parentDirectory, options.parentDigest, options.next.directory);
  const task = decisionTaskContext(options.context, parent.operation.cwd);
  if (digest(task) !== digest(parent.decisionBinding!.task)) throw new Error("A new requirement needs a new provider assignment");
  text(options.next.id, "continuation id", 256); text(options.next.prompt, "continuation prompt", 400000);
  if (options.next.id === parent.id || resolve(options.next.directory) === resolve(options.parentDirectory)) throw new Error("Continuation needs a distinct job");
  protectedPath(options.path, [...admission.binding.roots, resolve(options.next.directory), resolve(options.parentDirectory)]);
  const binding: ContinuationRecord["binding"] = { parentDirectory: resolve(options.parentDirectory), parentDigest: options.parentDigest,
    next: { ...options.next, directory: resolve(options.next.directory) }, admissionDigest: digest(admission), taskDigest: digest(task), assignmentClass: admission.binding.assignmentClass };
  const bindingDigest = digest(binding), store = new Store(admission.store);
  try {
    const authority = { operation: "record" as const, destination: null, scope: [task.workspace], targets: [task.workspace], policyRevision: bindingDigest };
    const action = authorizeAction(store, proposeAction(store, task.taskId, authority), authority, defaultPolicy(bindingDigest), task.workspace);
    if (action.status !== "authorized") throw new Error("Continuation provenance refused");
    const record: ContinuationRecord = { version: 1, actionId: action.actionId, bindingDigest, binding };
    const temporary = `${options.path}.${randomUUID()}.tmp`;
    try { durableJson(temporary, record); linkSync(temporary, options.path); } finally { rmSync(temporary, { force: true }); }
    return { path: options.path, digest: fileDigest(options.path) };
  } finally { store.close(); }
}

export function readProviderContinuation(parentDirectory: string, parentDigest: string, next: ProviderContinuation) {
  if (!next.admission) throw new Error("Guarded follow-up requires trusted continuation admission");
  const { parent, admission } = parentBinding(parentDirectory, parentDigest, next.directory);
  const path = protectedPath(next.admission, [...admission.binding.roots, resolve(parentDirectory), resolve(next.directory)]);
  const record = JSON.parse(narrativeFile(dirname(path), path)) as ContinuationRecord;
  const expected = { parentDirectory: resolve(parentDirectory), parentDigest, next: { id: next.id, prompt: next.prompt, directory: resolve(next.directory) },
    admissionDigest: digest(admission), taskDigest: digest(parent.decisionBinding!.task), assignmentClass: admission.binding.assignmentClass };
  if (record.version !== 1 || digest(record.binding) !== record.bindingDigest || digest(expected) !== record.bindingDigest) throw new Error("Continuation identity changed");
  const store = new Store(admission.store, { readOnly: true });
  try {
    const action = store.readAction(record.actionId);
    if (!action || action.status !== "authorized" || action.operation !== "record" || action.destination !== null ||
        action.policyRevision !== record.bindingDigest || action.taskId !== admission.binding.taskId || action.taskVersion !== admission.binding.taskVersion ||
        digest(action.scope) !== digest([parent.operation.cwd]) || digest(action.expectedInputs) !== digest([parent.operation.cwd])) throw new Error("Continuation authority changed");
  } finally { store.close(); }
  return { path, digest: fileDigest(path), parentDirectory: resolve(parentDirectory), parentDigest, next: expected.next };
}
