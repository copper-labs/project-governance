import { object, text } from "./core.ts";
import type { NativeProvider } from "./provider-binding.ts";

export interface CategoryBinding { description: string; model: string; effort: string }
export interface ModelRoutingSettings {
  providers: Partial<Record<NativeProvider, { require_governed_entry: boolean; assignment_classes: string[]; categories: Record<string, CategoryBinding> }>>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error("Unknown model routing key");
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value) || value === "unknown") throw new Error("Invalid or reserved routing identifier");
  return value;
}

/** Pure declaration parsing. Native availability and model compatibility belong to provider admission. */
export function modelRoutingSettings(raw: unknown): ModelRoutingSettings {
  if (raw === undefined) return { providers: {} };
  const declaration = object(raw, "model routing"); keys(declaration, ["providers"]);
  const providers = object(declaration.providers ?? {}, "model routing providers"); keys(providers, ["claude", "codex", "gemini"]);
  const parsed: ModelRoutingSettings["providers"] = {};
  for (const [id, value] of Object.entries(providers)) {
    const entry = object(value); keys(entry, ["require_governed_entry", "assignment_classes", "categories"]);
    const require_governed_entry = entry.require_governed_entry ?? false;
    if (typeof require_governed_entry !== "boolean") throw new Error("Governed entry requirement must be boolean");
    const classes = entry.assignment_classes;
    if (!Array.isArray(classes) || classes.length > 16) throw new Error("Routing requires a bounded assignment class list");
    const assignment_classes = classes.map(identifier);
    if (new Set(assignment_classes).size !== classes.length) throw new Error("Duplicate routing assignment class");
    const categories = object(entry.categories, "routing categories");
    if (Object.keys(categories).length > 16) throw new Error("Too many task categories");
    const bindings: Record<string, CategoryBinding> = {};
    for (const [category, rawBinding] of Object.entries(categories)) {
      identifier(category);
      const binding = object(rawBinding); keys(binding, ["description", "model", "effort"]);
      bindings[category] = { description: text(binding.description, "category description", 1000),
        model: text(binding.model, "category model", 200), effort: text(binding.effort, "category effort", 200) };
    }
    parsed[id as NativeProvider] = { require_governed_entry, assignment_classes, categories: bindings };
  }
  return { providers: parsed };
}
