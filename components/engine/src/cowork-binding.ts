import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { recordPaths } from "../../harness/src/ops/concurrency.ts";
import { withinScope } from "../../harness/src/ops/authority.ts";

export interface CoworkBinding { session: string; task_id: string; expected_version?: number }

/** Read-only calls cannot silently create a workspace or refresh a stale task binding. */
export function withCoworkBinding<T>(workspace: string, request: CoworkBinding, mutation: boolean,
  operation: (binding: { store: Store; attemptId: string; recordWrites: (paths: string[]) => void; assertPaths: (paths: string[]) => void }) => T): T {
  if (!/^cowork:[a-f0-9-]{36}$/u.test(request.session) || !request.task_id)
    throw new Error("cowork-task-binding-invalid");
  const context = workContext(workspace);
  const store = new Store(defaultDbPath(workspace), { readOnly: !mutation });
  try {
    const workspaceId = store.workspaceId(context.locator);
    const attempt = workspaceId ? store.boundAttempt(request.session, workspaceId) : null;
    const task = store.readTask(request.task_id);
    if (!task || !attempt || attempt.taskId !== task.taskId || attempt.worktree !== context.worktree ||
        task.worktree !== context.worktree) throw new Error("cowork-task-binding-mismatch");
    if (mutation && (task.status !== "open" || request.expected_version !== task.version || attempt.taskVersion !== task.version))
      throw new Error("cowork-task-version-conflict");
    const assertPaths = (paths: string[]) => {
      const scope = task.items.filter(item => item.kind === "scope" && !item.revoked).map(item => item.body);
      if (!paths.length || paths.some(path => !withinScope(path, scope, context.worktree))) throw new Error("cowork-path-outside-task");
    };
    return operation({ store, attemptId: attempt.attemptId, assertPaths, recordWrites: paths => {
      if (!mutation) throw new Error("cowork-read-cannot-record-write");
      assertPaths(paths);
      recordPaths(store, { session: request.session, workspaceId: workspaceId!, taskId: task.taskId,
        cwd: context.worktree, paths, mode: "write" });
    } });
  } finally { store.close(); }
}
