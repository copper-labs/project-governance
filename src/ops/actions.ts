import { randomUUID } from "node:crypto";
import type { Store } from "../store/store.ts";
import { authorize, type AuthorityRequest, type Policy } from "./authority.ts";
import type { Action } from "../model/types.ts";
export function proposeAction(store: Store, taskId: string, req: AuthorityRequest): Action {
    const task = store.readTask(taskId);
    if (!task)
        throw new Error(`no task ${taskId}`);
    return store.insertAction({ actionId: randomUUID(), taskId, taskVersion: task.version, operation: req.operation, scope: req.scope, destination: req.destination, policyRevision: req.policyRevision, status: "proposed", expectedInputs: req.targets, intendedOutputs: [], reconcile: null, refusedReason: null });
}
export function authorizeAction(store: Store, action: Action, req: AuthorityRequest, policy: Policy, root: string): Action {
    const task = store.readTask(action.taskId);
    if (!task)
        throw new Error("unknown task");
    const same = JSON.stringify([action.operation, action.scope, action.destination, action.policyRevision, action.expectedInputs]) === JSON.stringify([req.operation, req.scope, req.destination, req.policyRevision, req.targets]);
    const verdict = task.version !== action.taskVersion ? { ok: false as const, reason: `task revised to version ${task.version}` } :
        !same ? { ok: false as const, reason: "authorization request differs from proposed action" } : authorize(req, policy, task, root);
    return store.transitionAction(action.actionId, action.revision, verdict.ok ? "authorized" : "refused", verdict.ok ? {} : { refusedReason: verdict.reason });
}
export function prepareAction(store: Store, action: Action, intendedOutputs: string[], reconcile: string): Action {
    return store.transitionAction(action.actionId, action.revision, "prepared", { intendedOutputs, reconcile });
}
export function beginAction(store: Store, action: Action): Action { return store.transitionAction(action.actionId, action.revision, "in-progress"); }
export function cancelAction(store: Store, action: Action, reason: string): Action {
    if (["in-progress", "outcome-unknown"].includes(action.status))
        throw new Error("cancel the owning job and consume its terminal receipt");
    return store.transitionAction(action.actionId, action.revision, "cancelled", { refusedReason: reason });
}
