/** Saved evidence is raw by default; authored summaries and declared guidance retain their roles. */
export function evidenceArtifact(path: string, declared?: ReadonlySet<string>): boolean {
  if (!path.startsWith("docs/") || path.startsWith("docs/exec-plans/active/") || declared?.has(path)) return false;
  const parts = path.split("/"), evidence = parts.indexOf("evidence");
  if (evidence < 0) return false;
  const nested = parts.slice(evidence + 1, -1);
  if (nested.some(part => part === "before" || part === "after")) return true;
  return !["readme.md", "index.md"].includes(parts.at(-1)!.toLowerCase());
}
