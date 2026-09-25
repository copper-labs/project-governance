import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { durableJson } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";

export class ContextRouteError extends Error {
  readonly code: string;
  receiptPath: string | null = null;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** A failed entry still has evidence, without retaining prompt text, flags or parser payloads. */
export function recordContextFailure(root: string, error: unknown): ContextRouteError {
  const message = error instanceof Error ? error.message : "";
  const known = error instanceof ContextRouteError ? error
    : message.startsWith("unsafe") ? new ContextRouteError("unsafe-path", "An unsafe repository-relative context path was refused.")
    : message === "Staged context cannot select another base" ? new ContextRouteError("invalid-comparison", "Staged context cannot select another base; omit --base-ref when using --staged.")
    : message === "Binary optional source" ? new ContextRouteError("binary-source", "Binary optional source refused; select a text source or remove this explicit optional input.")
    : message.startsWith("First-commit inventory exceeds") ? new ContextRouteError("first-commit-capture-bound", "First-commit capture exceeds 4096 files; configure .gitignore for dependencies and generated files, or use a narrower staged scope.")
    : message === "Context profile identity mismatch" ? new ContextRouteError("profile-identity-mismatch", "Context profile identity mismatch: profile.yaml and facts.lock.yaml identify different projects.")
    : message.includes("changed while preparing") ? new ContextRouteError("stale-source", "Context sources changed while preparing the packet; route again against the current subject.")
    : (error as NodeJS.ErrnoException)?.code?.startsWith("ERR_PARSE_ARGS")
      ? new ContextRouteError("invalid-arguments", "Invalid context-route arguments. Use context-route --help; --task is task prose, --decision-task is an ID.")
      : message.startsWith("Task context unavailable")
        ? new ContextRouteError("task-unavailable", `Task context ${message.match(/\(([a-z-]+)\)/u)?.[1] ?? "unavailable"}; create or resume this session's task, or supply --task <purpose> and --revision <revision>.`)
        : message.startsWith("Git comparison failed")
          ? new ContextRouteError("subject-unavailable", "The Git comparison is unavailable. Verify the repository and --base-ref; a new repository with no commits is supported.")
          : message.startsWith("Context configuration unavailable")
            ? new ContextRouteError("configuration-unavailable", "Context routing requires readable config/governance/profile.yaml and facts.lock.yaml in the selected subject.")
            : new ContextRouteError("context-entry-failed", "Context routing could not complete. Check captured configuration and source identity; use context-route --help for supported arguments.");
  if (known !== error) known.cause = error;
  try {
    known.receiptPath = join(contextStateRoot(root), "entry-failures", `${randomUUID()}.json`);
    durableJson(known.receiptPath, { version: 1, createdAt: new Date().toISOString(), caller: "context-route", status: "failed",
      code: known.code, message: known.message, providerCalled: null, providerUsage: "unknown", taskUse: "unknown" });
  } catch { known.receiptPath = null; }
  return known;
}

export const CONTEXT_ROUTE_HELP = `context-route [--task <purpose> --revision <revision>] [--decision-task <id>]
  Uses the current session's bound task when available. --task is prose, not a task ID.
  --changed-path <path>   Repeatable routing scope (file or directory).
  --optional-path <path>  Repeatable local excerpt input; does not grant hosted disclosure.
  --entry <id> --expansion <1|2>  Continue the current native prompt with its shared allowance.
  --links <path>          Repeatable one-hop declared relationship request during expansion.
  --staged               Read staged policy and sources, including a first commit.
  --base-ref <ref>        Compare with a commit (default HEAD); cannot combine with --staged.
  --include-expansion    Include declared expansion context.
  --optional-excerpt-bytes <bytes>  Bound each optional excerpt.
  Output is JSON with content, original references, omissions and a receipt ID.
  No JEV token is required; hosted selection uses the project's explicit sharing policy.`;
