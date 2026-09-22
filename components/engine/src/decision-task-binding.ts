import { existsSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { Store, StoreSchemaMismatch } from "../../harness/src/store/store.ts";
import { defaultDbPath, sessionId, workContext } from "../../harness/src/store/location.ts";
import { decisionTaskContext, readDecisionTaskContext, TaskContextError, type DecisionTaskContext } from "./decision-task-context.ts";
import { resolveDecisionScope } from "./decision-scope.ts";

export interface TaskContextResolution {
  context: DecisionTaskContext | null;
  status: string;
  source: "explicit" | "context-file" | "session" | "unavailable";
  attemptId?: string;
}

/** Reuse the continuity owner. Missing optional intent never creates state or guesses another task. */
export function resolveTaskContext(workspace: string, explicit: {
  context?: DecisionTaskContext; path?: string; taskId?: string; revision?: string;
} = {}): TaskContextResolution {
  const path = explicit.path ?? process.env.GOVERNANCE_DECISION_CONTEXT;
  let result: TaskContextResolution;
  if (explicit.context) result = { context: decisionTaskContext(explicit.context, workspace), source: "explicit", status: "bound" };
  else if (path) result = { context: readDecisionTaskContext(path, workspace), source: "context-file", status: "bound" };
  else result = sessionTaskContext(workspace);
  if (result.context) resolveDecisionScope(workspace, explicit, result.context);
  return result;
}

function sessionTaskContext(workspace: string): TaskContextResolution {
  const unavailable = (status: string): TaskContextResolution => ({ context: null, source: "unavailable", status });
  const session = sessionId();
  if (!session) return unavailable("session-unavailable");
  let store: Store | undefined;
  try {
    const where = workContext(workspace), database = defaultDbPath(where.worktree);
    if (!existsSync(database)) return unavailable("task-store-unavailable");
    store = new Store(database, { readOnly: true });
    const workspaceId = store.workspaceId(where.locator);
    if (!workspaceId) return unavailable("workspace-unbound");
    const attempt = store.boundAttempt(session, workspaceId);
    if (!attempt) return unavailable("session-unbound");
    if (attempt.worktree !== where.worktree) return unavailable("workspace-moved");
    const task = store.readTask(attempt.taskId);
    if (!task || task.worktree !== where.worktree) return unavailable("task-workspace-mismatch");
    if (task.status !== "open") return unavailable("task-not-open");
    if (task.version !== attempt.taskVersion) return unavailable("task-version-stale");
    const scopes = task.items.filter(item => item.kind === "scope" && !item.revoked).map(item => {
      if (!isAbsolute(item.body)) throw new TaskContextError("task-scope-not-absolute", "Task scope must be absolute");
      const path = relative(where.worktree, item.body);
      if (path === ".." || path.startsWith("../") || isAbsolute(path)) throw new TaskContextError("task-scope-outside-workspace", "Task scope outside worktree");
      return path;
    }).filter(Boolean);
    const context = decisionTaskContext({ version: 1, workspace: where.worktree, taskId: task.taskId,
      revision: String(task.version), requirement: task.outcome,
      acceptance: task.items.filter(item => item.kind === "acceptance" && !item.revoked).map(item => item.body),
      sourcePaths: scopes }, where.worktree);
    // A concurrent resume/revision may invalidate the projection while its items are read.
    if (store.boundAttempt(session, workspaceId)?.attemptId !== attempt.attemptId ||
        store.readTask(task.taskId)?.version !== task.version) return unavailable("task-version-stale");
    return { context, source: "session", status: "bound", attemptId: attempt.attemptId };
  } catch (error) { return unavailable(error instanceof TaskContextError ? error.code
    : error instanceof StoreSchemaMismatch ? "task-store-schema-mismatch" : "task-context-unavailable"); }
  finally { store?.close(); }
}

/** Telemetry carries identity and readiness, never another copy of task prose. */
export interface TaskBindingReceipt {
  status: string; source: TaskContextResolution["source"]; attemptId?: string; taskId: string | null; revision: string | null;
}
export function taskBindingReceipt(resolution: TaskContextResolution): TaskBindingReceipt {
  const { context, ...binding } = resolution;
  return { ...binding, taskId: context?.taskId ?? null, revision: context?.revision ?? null };
}
