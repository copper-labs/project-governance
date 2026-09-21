import { parse } from "yaml";
import type { AnySchema } from "ajv";
import { ValidationSubject, readSubjectSource, type ChangeScope } from "../change-subject.ts";
import { type DispositionConfig } from "./quality-dispositions.ts";
import type { MaintainabilityOptions } from "./maintainability.ts";

function yamlMapping(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = parse(Buffer.from(bytes).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a YAML mapping");
  return value as Record<string, unknown>;
}

/** The validation graph owns configuration too; unrelated working-tree edits cannot change a staged check. */
export function maintainabilityInputs(subject: ValidationSubject, scope: ChangeScope, schema: AnySchema, today: string,
  policyPath = "config/policies/code-quality.yaml", dispositionsPath = "config/policies/code-quality-dispositions.yaml",
  defaults?: { policy: Record<string, unknown>; dispositions: Record<string, unknown> }): MaintainabilityOptions {
  const load = (path: string, fallback: Record<string, unknown>) => {
    if (!subject.source(path)) {
      const removed = scope.records.some(record => (record.path === path || record.previous_path === path) && (record.status === "deleted" || record.previous_path === path));
      return removed ? { invalid_document_shape: "deleted" } : fallback;
    }
    try { return yamlMapping(subject.read(path, 1024 * 1024)); }
    catch { return { invalid_document_shape: "unreadable-or-invalid-yaml" }; }
  };
  const policy = load(policyPath, defaults?.policy ?? {});
  const dispositions = load(dispositionsPath, defaults?.dispositions ?? { version: 2, owner: "runtime", dispositions: [] });
  let prior: DispositionConfig | null = null, historyError = "";
  const record = scope.records.find(record => record.path === dispositionsPath || record.previous_path === dispositionsPath);
  if (record?.before) {
    try {
      const raw = yamlMapping(readSubjectSource(subject.root, record.before, 1024 * 1024));
      // History is evidence, never an exception grant. Preserve old active records without
      // requiring the before-image to satisfy today's schema, so repairs and migrations work.
      const records = raw["dispositions"];
      if (!Array.isArray(records) || records.some(item => !item || typeof item !== "object" || Array.isArray(item)))
        historyError = "Previous disposition registry has an invalid record collection.";
      else prior = { version: typeof raw["version"] === "number" ? raw["version"] : 0,
        owner: typeof raw["owner"] === "string" ? raw["owner"] : "historical", dispositions: records };
    } catch { historyError = "Previous disposition registry cannot be read or parsed."; }
  }
  return { policy, dispositions, dispositionSchema: schema, prior, historyError, today, policyPath, dispositionsPath };
}
