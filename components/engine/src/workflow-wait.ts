import { parseArgs } from "node:util";
import { statSync } from "node:fs";
import { WorkflowStore } from "./workflow-store.ts";

/** Observes one existing run; timeout never dispatches, retries or cancels work. */
export async function workflowWaitCommand(args: string[]) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    database: { type: "string" }, run: { type: "string" }, "wait-ms": { type: "string", default: "30000" },
    "after-event": { type: "string" },
  } });
  const waitMs = Number(values["wait-ms"]), after = values["after-event"] === undefined ? undefined : Number(values["after-event"]);
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 30000 ||
      (after !== undefined && (!Number.isSafeInteger(after) || after < 0))) throw new Error("Invalid workflow wait bounds");
  if (!values.database || !statSync(values.database).isFile() || !values.run) throw new Error("Existing workflow ledger and run required");
  const store = new WorkflowStore(values.database), deadline = performance.now() + waitMs;
  try {
    while (true) {
      const run = store.read(values.run), events = after === undefined ? [] : store.events(run.id, after);
      const terminal = !["queued", "running", "reconciling"].includes(run.state);
      const timeout = performance.now() >= deadline;
      if (terminal || events.length || timeout) {
        return { run, stages: store.stages(run.id), events,
          reason: terminal ? "outcome" : events.length ? "event" : "timeout" };
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, deadline - performance.now()))));
    }
  } finally { store.close(); }
}
