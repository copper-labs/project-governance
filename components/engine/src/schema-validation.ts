import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";

/** Calendar validation is deterministic and rejects JavaScript's overflow normalization. */
export function isoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// Existing schemas intentionally use required-only branches under not/anyOf. This disables only
// AJV's schema-authoring warning; required fields and every validation keyword remain enforced.
const validator = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, addUsedSchema: false });
validator.addFormat("date", { type: "string", validate: isoDate });

/** The shipped schema remains the rule owner; diagnostics do not echo potentially sensitive values. */
export function schemaErrors(schema: AnySchema, value: unknown): string[] {
  const check = validator.compile(schema);
  if (check(value)) return [];
  return (check.errors ?? []).map(error => `${error.instancePath || "/"}: ${error.message ?? "invalid value"}`);
}
