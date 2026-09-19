#!/usr/bin/env -S node --experimental-strip-types
/**
 * One JSON command surface, callable as a subprocess by any host that can run a command.
 * No service, no plugin loader, no policy language.
 */
import { resolve } from "node:path";
import { Store } from "./store/store.ts";
import { authorizeAction, proposeAction, recoverAll, type Inspection } from "./ops/actions.ts";
import { defaultPolicy, withinScope, type AuthorityRequest } from "./ops/authority.ts";
import { runCheck } from "./ops/execution.ts";
import { changedPaths, resolveSubject, retrieve, routeByDeclaredTarget, type SubjectRef } from "./ops/retrieval.ts";
import { initRepo } from "./ops/adapter.ts";
import { defaultDbPath, sessionId, workContext } from "./store/location.ts";
import { existsSync } from "node:fs";
import type { Action, TaskItem } from "./model/types.ts";

const USAGE = `harness <command>

  init          [--file AGENTS.md]...      write the block that makes your agent use this
  task fork     --task <id> [--outcome <text>]   branch a job into this worktree
  task create   --outcome <text> [--constraint <text>]... [--scope <path>]... [--acceptance <text>]...
  task show     --task <id>
  task list     [--all]
  task revise   --task <id> [--constraint <text>]... [--ruled-out <text>]... [--note <text>]...
                [--open-question <text>]... [--revoke <seq>]... [--status <status>]
  context get   --task <id> [--at staged|worktree|<rev>] [--path <p>]... [--mandatory <p>]... [--budget <bytes>]
  check run     --task <id> --claim <text> [--subject <digest>] -- <command> [args...]
  recover
  usage         [--task <id>]
  export

Options: --db <path>  (default .harness/harness.db)

The harness does not write to a working tree. It reads, runs declared checks, and records.`;

function parse(argv: string[]): { flags: Record<string, string[]>; rest: string[] } {
  const flags: Record<string, string[]> = {};
  const rest: string[] = [];
  let afterDoubleDash = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (afterDoubleDash) { rest.push(a); continue; }
    if (a === "--") { afterDoubleDash = true; continue; }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) { (flags[key] ??= []).push("true"); }
      else { (flags[key] ??= []).push(value); i++; }
    } else rest.push(a);
  }
  return { flags, rest };
}

const one = (f: Record<string, string[]>, k: string): string | undefined => f[k]?.[0];
const emit = (value: unknown): void => { process.stdout.write(JSON.stringify(value, null, 2) + "\n"); };
const fail = (message: string, code = 1): never => {
  process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
  process.exit(code);
};

function main(argv: string[]): void {
  const { flags, rest } = parse(argv);
  const [group, verb] = rest;
  const root = process.cwd();
  // The store follows the repository, so every worktree of it finds the same jobs.
  const dbPath = one(flags, "db") ? resolve(one(flags, "db")!) : defaultDbPath(root);
  const who = sessionId();
  const where = workContext(root);

  if (!group || group === "help" || flags["help"]) { process.stdout.write(USAGE + "\n"); return; }

  const store = new Store(dbPath);
  try {
    if (group === "init") {
      const results = initRepo(root, flags["file"] ?? []);
      return emit({
        ok: true,
        repo: root,
        files: results,
        next: "Start a normal session in your agent. It will record the job and call the harness itself.",
      });
    }

    if (group === "task" && verb === "create") {
      const outcome = one(flags, "outcome") ?? fail("task create requires --outcome");
      const items: Omit<TaskItem, "seq" | "revoked">[] = [
        ...(flags["constraint"] ?? []).map((b) => ({ kind: "constraint" as const, provenance: "operator" as const, body: b })),
        ...(flags["scope"] ?? []).map((b) => ({ kind: "scope" as const, provenance: "operator" as const, body: resolve(b) })),
        ...(flags["acceptance"] ?? []).map((b) => ({ kind: "acceptance" as const, provenance: "operator" as const, body: b })),
      ];
      return emit({
        ok: true,
        task: store.createTask(outcome, items, { ...where, session: who }),
        store: dbPath,
      });
    }

    if (group === "task" && verb === "fork") {
      const id = one(flags, "task") ?? fail("task fork requires --task");
      const forked = store.forkTask(id, { ...where, session: who }, {
        ...(one(flags, "outcome") ? { outcome: one(flags, "outcome")! } : {}),
      });
      return emit({
        ok: true, task: forked, forkedFrom: id,
        inherited: forked.items.map((i) => `${i.kind}: ${i.body}`),
        note: "Constraints and ruled-out findings were carried over. Progress starts fresh.",
      });
    }

    if (group === "task" && verb === "show") {
      const id = one(flags, "task") ?? fail("task show requires --task");
      const task = store.readTask(id) ?? fail(`no task ${id}`);
      return emit({ ok: true, task, actions: store.listActions(id), evidence: store.listEvidence(id), usage: store.usageTotals(id) });
    }

    if (group === "task" && verb === "list") {
      const mine = flags["all"] ? null : where.worktree;
      const all = store.listTasks().map((t) => ({
        taskId: t.taskId, version: t.version, status: t.status, outcome: t.outcome,
        worktree: t.worktree, branch: t.branch, parentTask: t.parentTask,
        thisWorktree: t.worktree === where.worktree,
      }));
      return emit({
        ok: true, store: dbPath, worktree: where.worktree, branch: where.branch,
        tasks: mine ? all.filter((t) => t.thisWorktree) : all,
        otherWorktrees: mine ? all.filter((t) => !t.thisWorktree).length : 0,
        hint: mine ? "Jobs from other worktrees of this repository are hidden. Use --all to see them, and 'task fork' to branch one into this worktree." : undefined,
      });
    }

    if (group === "task" && verb === "revise") {
      const id = one(flags, "task") ?? fail("task revise requires --task");
      const added: Omit<TaskItem, "seq" | "revoked">[] = [
        ...(flags["constraint"] ?? []).map((b) => ({ kind: "constraint" as const, provenance: "operator" as const, body: b })),
        ...(flags["note"] ?? []).map((b) => ({ kind: "handoff" as const, provenance: "observed" as const, body: b })),
        ...(flags["ruled-out"] ?? []).map((b) => ({ kind: "ruled-out" as const, provenance: "observed" as const, body: b })),
        ...(flags["open-question"] ?? []).map((b) => ({ kind: "open-question" as const, provenance: "hypothesis" as const, body: b })),
      ];
      const revoke = (flags["revoke"] ?? []).map(Number).filter((n) => Number.isInteger(n));
      const status = one(flags, "status") as "open" | "needs-input" | "accepted" | "cancelled" | undefined;
      return emit({ ok: true, task: store.reviseTask(id, added, { revoke, ...(status ? { status } : {}) }) });
    }

    if (group === "context" && verb === "get") {
      const id = one(flags, "task") ?? fail("context get requires --task");
      const task = store.readTask(id) ?? fail(`no task ${id}`);
      const at = one(flags, "at") ?? "staged";
      const ref: SubjectRef =
        at === "staged" ? { kind: "staged" } : at === "worktree" ? { kind: "worktree" } : { kind: "commit", rev: at };
      const subject = resolveSubject(root, ref);
      if ("error" in subject) return emit({ ok: false, error: subject.error });

      // Start with what the task declares; fall back to the no-diff route when there is no diff.
      const requested = flags["path"] ?? [];
      const changed = requested.length ? [] : changedPaths(root, subject);
      const paths = requested.length ? requested : changed;
      const route = paths.length ? "declared-or-changed" : "no-diff";
      // Requested paths go through the same authority check as anything else: a path the
      // task's scope does not cover is refused here, not quietly read.
      const taskScope = task.items.filter((i) => !i.revoked && i.kind === "scope").map((i) => i.body);
      if (taskScope.length && requested.length) {
        const outside = requested.filter((p) => !withinScope(p, taskScope, root));
        if (outside.length) {
          return emit({
            ok: false,
            refused: `outside the task's scope: ${outside.join(", ")}`,
            scope: taskScope,
          });
        }
      }

      const budgetBytes = Number(one(flags, "budget") ?? 256 * 1024);
      const spent = store
        .listEvidence(id)
        .filter((e) => e.claim === "context budget")
        .reduce((n, e) => n + Number(e.observed || 0), 0);

      const result = retrieve(
        store, root, subject,
        paths.length ? paths : routeByDeclaredTarget(task),
        { maxBytes: budgetBytes, usedBytes: spent },
        { mandatory: flags["mandatory"] ?? [] },
      );
      // The budget binds to the task, so what this request spent is recorded against it.
      store.recordEvidence({
        taskId: id, actionId: null, artifactId: null,
        claim: "context budget",
        observed: String(result.budget.usedBytes - spent),
        establishes: `this request spent ${result.budget.usedBytes - spent} of the task's ${budgetBytes} byte budget`,
        confirmation: "confirmed", criticality: "analytics",
      });
      return emit({
        ok: result.blocked === null,
        subject: { digest: subject.digest, label: subject.label },
        route,
        blocked: result.blocked,
        artifacts: result.artifacts.map((a) => ({ path: a.path, bytes: a.bytes, subject: a.subject })),
        deferred: result.deferred,
        unavailable: result.unavailable,
        budget: result.budget,
      });
    }

    if (group === "check" && verb === "run") {
      const id = one(flags, "task") ?? fail("check run requires --task");
      const claim = one(flags, "claim") ?? fail("check run requires --claim");
      const command = rest[2] ?? fail("check run requires a command after --");
      const args = rest.slice(3);
      const task = store.readTask(id) ?? fail(`no task ${id}`);
      const scope = task.items.filter((i) => !i.revoked && i.kind === "scope").map((i) => i.body);
      const req: AuthorityRequest = {
        operation: "check",
        scope: scope.length ? scope : [root],
        destination: null,
        policyRevision: "policy-1",
        targets: [root],
      };
      let action = proposeAction(store, id, req);
      action = authorizeAction(store, action, req, defaultPolicy(), root);
      if (action.status === "refused") {
        return emit({ ok: false, refused: action.refusedReason, action });
      }
      const result = runCheck(store, action, {
        claim, command, args, cwd: root,
        subject: one(flags, "subject") ?? null,
      });
      return emit({
        ok: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode, durationMs: result.durationMs, timedOut: result.timedOut,
        establishes: result.evidence?.establishes, confirmation: result.evidence?.confirmation,
        receipt: result.receiptArtifactId,
      });
    }

    if (group === "recover") {
      // Inspect real effects; never replay from the record.
      const inspect = (a: Action): Inspection => {
        const outputs = a.intendedOutputs.filter((o) => !o.startsWith("receipt:"));
        if (outputs.length === 0) {
          return { established: false, note: "no inspectable outputs were declared; the outcome cannot be established here" };
        }
        const present = outputs.filter((o) => existsSync(o));
        if (present.length === outputs.length) return { established: true, completed: true, note: "all declared outputs present" };
        if (present.length === 0) return { established: true, completed: false, note: "no declared output present" };
        return { established: false, note: `partial effect: ${present.length} of ${outputs.length} outputs present` };
      };
      return emit({ ok: true, recovered: recoverAll(store, inspect).map((a) => ({ actionId: a.actionId, status: a.status, note: a.refusedReason })) });
    }

    if (group === "usage") return emit({ ok: true, usage: store.usageTotals(one(flags, "task")) });
    if (group === "export") return emit(store.exportJson());

    fail(`unknown command: ${[group, verb].filter(Boolean).join(" ")}`);
  } finally {
    store.close();
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  // A stack trace is not a useful answer. Say what went wrong and what to do about it.
  const message = err instanceof Error ? err.message : String(err);
  const hint = /disk I\/O|unable to open|readonly|permission/i.test(message)
    ? "The harness could not open its database. Check the folder is writable, or pass --db <path> to put it somewhere else."
    : /no task/i.test(message)
      ? "Run 'harness task list' to see the jobs that exist."
      : null;
  process.stdout.write(
    JSON.stringify({ ok: false, error: message, ...(hint ? { hint } : {}) }, null, 2) + "\n",
  );
  process.exit(1);
}
