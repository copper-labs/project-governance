import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { workContext, defaultDbPath } from "../../harness/src/store/location.ts";
import { resume } from "../../harness/src/ops/continuity.ts";
import { withinScope } from "../../harness/src/ops/authority.ts";
import type { TaskItem } from "../../harness/src/model/types.ts";
import { safeSubjectPath } from "./change-subject.ts";

export function coworkTaskStart(workspace: string, input: { outcome: string; scope: string[]; acceptance: string[]; constraints: string[] }) {
  const context = workContext(workspace), session = `cowork:${randomUUID()}`;
  const store = new Store(defaultDbPath(workspace));
  try {
    const scopes = input.scope.map(path => {
      if (path !== ".") safeSubjectPath(path);
      if (!withinScope(path, [context.worktree], context.worktree)) throw new Error("cowork-task-scope-invalid");
      return resolve(context.worktree, path);
    });
    if (!scopes.length) throw new Error("cowork-task-scope-required");
    const items: Omit<TaskItem, "seq" | "revoked">[] = [
      ...scopes.map(body => ({ kind: "scope" as const, body, provenance: "operator" as const })),
      ...input.acceptance.map(body => ({ kind: "acceptance" as const, body, provenance: "operator" as const })),
      ...input.constraints.map(body => ({ kind: "constraint" as const, body, provenance: "operator" as const })),
    ];
    return store.atomic(() => {
      const task = store.createTask(input.outcome, items, { ...context, session });
      const workspaceId = store.workspace(context.locator, context.worktree);
      const attempt = store.bind(task.taskId, session, workspaceId, context.worktree);
      return { ok: true, session, task, attempt, provenance: "host-reported intent" };
    });
  } finally { store.close(); }
}

export function coworkTaskResume(workspace: string, input: { task_id: string; session?: string; after?: number; budget?: number }) {
  const context = workContext(workspace), session = input.session ?? `cowork:${randomUUID()}`;
  if (!/^cowork:[a-f0-9-]{36}$/u.test(session)) throw new Error("cowork-session-invalid");
  const store = new Store(defaultDbPath(workspace));
  try {
    const task = store.readTask(input.task_id);
    if (!task || task.worktree !== context.worktree) throw new Error("cowork-task-workspace-mismatch");
    const workspaceId = store.workspace(context.locator, context.worktree);
    const attempt = store.bind(task.taskId, session, workspaceId, context.worktree);
    const packet = resume(store, task.taskId, input.after ?? 0, input.budget ?? 16_000, attempt, context.worktree);
    // A task scoped to one file still belongs to this worktree; file access remains scope-checked.
    const scopes = task.items.filter(item => !item.revoked && item.kind === "scope").map(item => item.body);
    const compatible = scopes.length > 0 && scopes.every(path => withinScope(path, [context.worktree], context.worktree));
    return { ...packet, session, workspace: { worktree: context.worktree, withinTaskScope: compatible,
      next: compatible ? null : "Revise task scope for this worktree before reading or checking." } };
  } finally { store.close(); }
}
