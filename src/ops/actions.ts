import { randomUUID } from "node:crypto";
import type { Store } from "../store/store.ts";
import { authorize, type AuthorityRequest, type Policy } from "./authority.ts";
import { RevisionConflict, type Action } from "../model/types.ts";

/**
 * The Action lifecycle.
 *
 * `prepared` and `in-progress` exist because a durable record does not make an effect
 * atomic. Nothing here replays from the record: after an interruption real effects are
 * inspected, and where the outcome cannot be established it stays unknown.
 */
export function proposeAction(
  store: Store,
  taskId: string,
  req: AuthorityRequest,
): Action {
  const task = store.readTask(taskId);
  if (!task) throw new Error(`no task ${taskId}`);
  return store.insertAction({
    actionId: randomUUID(),
    taskId,
    taskVersion: task.version,
    operation: req.operation,
    scope: req.scope,
    destination: req.destination,
    policyRevision: req.policyRevision,
    status: "proposed",
    expectedInputs: req.targets,
    intendedOutputs: [],
    reconcile: null,
    refusedReason: null,
  });
}

/** Authority is decided before any effect, and a refusal is recorded rather than thrown away. */
export function authorizeAction(
  store: Store,
  action: Action,
  req: AuthorityRequest,
  policy: Policy,
  root: string,
): Action {
  const task = store.readTask(action.taskId);
  if (!task) throw new Error(`no task ${action.taskId}`);

  // An Action authorized against an older Task version is invalidated by the revision.
  if (task.version !== action.taskVersion) {
    return store.transitionAction(action.actionId, action.revision, "refused", {
      refusedReason: `task revised to version ${task.version}; this action was authorized against ${action.taskVersion}`,
    });
  }

  const verdict = authorize(req, policy, task, root);
  if (!verdict.ok) {
    return store.transitionAction(action.actionId, action.revision, "refused", {
      refusedReason: verdict.reason,
    });
  }
  return store.transitionAction(action.actionId, action.revision, "authorized");
}

/**
 * Record what the Action expects to do, and how its real effects could later be
 * reconciled, *before* it does anything.
 */
export function prepareAction(
  store: Store,
  action: Action,
  intendedOutputs: string[],
  reconcile: string,
): Action {
  return store.transitionAction(action.actionId, action.revision, "prepared", {
    intendedOutputs,
    reconcile,
  });
}

export function beginAction(store: Store, action: Action): Action {
  return store.transitionAction(action.actionId, action.revision, "in-progress");
}

export function completeAction(store: Store, action: Action): Action {
  return store.transitionAction(action.actionId, action.revision, "completed");
}

export function cancelAction(store: Store, action: Action, reason: string): Action {
  return store.transitionAction(action.actionId, action.revision, "cancelled", {
    refusedReason: reason,
  });
}

/** What an inspection of the world concluded about an interrupted Action. */
export type Inspection =
  | { established: true; completed: boolean; note: string }
  | { established: false; note: string };

/**
 * Resume by inspection, never by replay.
 *
 * An Action found in `prepared` never started, so it returns to `authorized` and may run.
 * One found `in-progress` may have had partial effects; if inspection cannot establish what
 * happened it becomes `outcome-unknown` and stops there, retaining the uncertainty rather
 * than resolving it by assumption.
 */
export function recoverAction(
  store: Store,
  action: Action,
  inspect: (a: Action) => Inspection,
): Action {
  if (action.status === "prepared") {
    return store.transitionAction(action.actionId, action.revision, "authorized", {
      refusedReason: "resumed: prepared but never started",
    });
  }
  if (action.status !== "in-progress") return action;

  const found = inspect(action);
  if (!found.established) {
    return store.transitionAction(action.actionId, action.revision, "outcome-unknown", {
      refusedReason: found.note,
    });
  }
  return store.transitionAction(
    action.actionId,
    action.revision,
    found.completed ? "completed" : "authorized",
    { refusedReason: `resumed by inspection: ${found.note}` },
  );
}

/** Recover every interrupted Action. Returns what each became. */
export function recoverAll(
  store: Store,
  inspect: (a: Action) => Inspection,
): Action[] {
  return store.listUnresolvedActions().map((a) => {
    try {
      return recoverAction(store, a, inspect);
    } catch (err) {
      // Another resumer won the race. That is the guard working, not a failure.
      if (err instanceof RevisionConflict) return store.readAction(a.actionId)!;
      throw err;
    }
  });
}
