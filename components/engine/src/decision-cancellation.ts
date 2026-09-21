import type { DecisionOptions } from "./decisions.ts";

/** Scope signal handlers to optional advice; preserve a non-success CLI exit on interruption. */
export async function withDecisionCancellation<T>(work: (options: DecisionOptions) => Promise<T>) {
  const controller = new AbortController();
  let exitCode: number | null = null;
  const interrupt = () => { exitCode ??= 130; controller.abort(); };
  const terminate = () => { exitCode ??= 143; controller.abort(); };
  process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
  try { return { value: await work({ signal: controller.signal }), exitCode }; }
  finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}
