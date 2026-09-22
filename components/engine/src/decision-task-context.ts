import { realpathSync } from "node:fs";
import { digest, object, text } from "./core.ts";
import { safeSubjectPath } from "./change-subject.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { resolveDecisionScope } from "./decision-scope.ts";

export interface DecisionTaskContext {
  version: 1; workspace: string; taskId: string; revision: string;
  requirement: string; acceptance: string[]; sourcePaths: string[];
}
export class TaskContextError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
function boundedText(value: unknown, label: string, maximum: number, code: string) {
  try { return text(value, label, maximum); }
  catch { throw new TaskContextError(code, `${label} is missing or exceeds its ${maximum}-character bound`); }
}

/** A caller carries task evidence, never permissions. Profile sharing and execution authority remain separate. */
export function decisionTaskContext(value: unknown, workspace: string): DecisionTaskContext {
  const raw = object(value, "decision task context");
  if (raw.version !== 1 || Object.keys(raw).some(key => !["version", "workspace", "taskId", "revision", "requirement", "acceptance", "sourcePaths"].includes(key)))
    throw new Error("Invalid decision task context");
  const binding = { workspace: text(raw.workspace, "task workspace"), taskId: text(raw.taskId, "task ID", 200), revision: text(raw.revision, "task revision", 128) };
  resolveDecisionScope(workspace, {}, binding);
  if (!Array.isArray(raw.acceptance) || !Array.isArray(raw.sourcePaths))
    throw new Error("Task acceptance and source paths must be bounded lists");
  if (raw.acceptance.length > 16) throw new TaskContextError("task-acceptance-limit", "Task acceptance exceeds 16 items");
  if (raw.sourcePaths.length > 32) throw new TaskContextError("task-scope-limit", "Task scope exceeds 32 paths");
  return { version: 1, ...binding, workspace: realpathSync(workspace), requirement: boundedText(raw.requirement, "task requirement", 4000, "task-requirement-limit"),
    acceptance: raw.acceptance.map(value => boundedText(value, "acceptance criterion", 500, "task-acceptance-limit")),
    sourcePaths: [...new Set(raw.sourcePaths.map(value => safeSubjectPath(boundedText(value, "task source path", 128, "task-path-limit"))))] };
}

/** The host can bind a file for its child process; no global current-task discovery is used. */
export function readDecisionTaskContext(path: string, workspace: string) {
  const bytes = narrativeFile(workspace, path);
  if (Buffer.byteLength(bytes) > 16_384) throw new Error("Decision task context exceeds its bound");
  return decisionTaskContext(JSON.parse(bytes), workspace);
}
export function decisionTaskPurpose(context: DecisionTaskContext) {
  return `${context.requirement}${context.acceptance.length ? `\nAcceptance criteria:\n${context.acceptance.map(item => `- ${item}`).join("\n")}` : ""}`;
}
export const decisionTaskIdentity = (context: DecisionTaskContext) => ({ workspace: context.workspace,
  taskId: context.taskId, revision: context.revision, requirementDigest: digest({ requirement: context.requirement, acceptance: context.acceptance }) });
