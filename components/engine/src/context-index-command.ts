/** One explicit cache-refresh surface; status stays passive and no command creates task state. */
import { parseArgs } from "node:util";
import { ValidationSubject, resolveChangeScope } from "./change-subject.ts";
import { contextStateRoot } from "./context-command.ts";
import { maintainContextProjection } from "./context-projection.ts";
import { projectionStatus } from "./context-projection-store.ts";
export function contextIndexCommand(args: string[], workspace: string) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    staged: { type: "boolean" }, rebuild: { type: "boolean" }, purpose: { type: "string" }, "cache-root": { type: "string" },
  } });
  if (positionals.length !== 1 || !["status", "refresh"].includes(positionals[0]!)) throw new Error("Use context-index status | refresh [--staged] [--rebuild]");
  const state = values["cache-root"] ?? contextStateRoot(workspace);
  if (positionals[0] === "status") {
    if (Object.keys(values).some(key => key !== "cache-root")) throw new Error("Index status takes no refresh options");
    return projectionStatus(state, workspace);
  }
  if (values["cache-root"]) throw new Error("Only passive status can inspect an explicit cache root");
  const scope = resolveChangeScope(workspace, values.staged ? { staged: true } : { baseRef: "HEAD" });
  const subject = new ValidationSubject(workspace, scope, { workingTree: !values.staged });
  const projection = maintainContextProjection(subject, subject.paths(), state, { rebuild: values.rebuild ?? false, purpose: values.purpose ?? "", deadlineAt: performance.now() + 3500 });
  return { ...projection.status, generation: projection.generation, priority: projection.priority.slice(0, 64),
    unavailable: projection.unavailable.slice(0, 64), mutation: "disposable-source-index-only" };
}
