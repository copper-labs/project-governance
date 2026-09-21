import { object } from "./core.ts";

export interface ProviderToolEvidence { name: string; category: string; state: string; error?: unknown }
export interface ProviderCompletion { outcome: "completed" | "blocked" | "incomplete"; answer: string;
  artifacts: string[]; sources: string[]; remaining: string[];
  checks: Array<{ description: string; result: string; evidence: string }> }

/** Model claims are reported separately from observed native tools and unresolved execution constraints. */
export function reconcileProviderCompletion(value: unknown, tools: ProviderToolEvidence[], denied: unknown[], requiredTools: string[]) {
  const record = object(value, "provider completion");
  if (typeof record.outcome !== "string" || !["completed", "blocked", "incomplete"].includes(record.outcome)) throw new Error("completion record has an invalid outcome");
  if (typeof record.answer !== "string" || !record.answer.trim()) throw new Error("completion record has no final answer");
  for (const key of ["artifacts", "sources", "remaining"]) {
    if (!Array.isArray(record[key]) || record[key].some(item => typeof item !== "string")) throw new Error(`completion record ${key} must be an array of strings`);
  }
  if (!Array.isArray(record.checks) || record.checks.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
      ["description", "result", "evidence"].some(key => typeof (item as Record<string, unknown>)[key] !== "string"))) throw new Error("completion record has invalid check evidence");
  const remaining = [...record.remaining as string[]];
  if (denied.some(item => !item || typeof item !== "object" || Array.isArray(item) || !(item as Record<string, unknown>).resolved)) {
    remaining.push("Resolve denied operations or required client input");
  }
  const observed = new Set(tools.filter(tool => tool.state === "DONE" && !tool.error).flatMap(tool => [tool.category, tool.name]));
  const missing = [...new Set(requiredTools)].filter(tool => !observed.has(tool)).sort();
  if (missing.length) remaining.push("Missing tool evidence: " + missing.join(", "));
  if (tools.some(tool => !["DONE", "ERROR", "CANCELLED"].includes(tool.state))) remaining.push("A tool operation did not reach a terminal state");
  return { state: record.outcome === "completed" && !remaining.length ? "succeeded" : "blocked",
    completion: { ...record, remaining } as unknown as ProviderCompletion };
}
