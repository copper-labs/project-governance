import { schemaErrors } from "./schema-validation.ts";
import { coworkEffect } from "./cowork-operations.ts";

const text = { type: "string", minLength: 1, maxLength: 8000 };
const identifier = { type: "string", minLength: 1, maxLength: 160 };
const path = { type: "string", minLength: 1, maxLength: 4096 };
const strings = (items: object, maxItems = 64) => ({ type: "array", items, maxItems });
const integer = { type: "integer", minimum: 0, maximum: 1_000_000 };
const expected = { type: "string", pattern: "^(absent|sha256:[a-f0-9]{64})$" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const bound = { project_id: identifier, session: { type: "string", pattern: "^cowork:[a-f0-9-]{36}$" }, task_id: identifier };
const version = { expected_version: { type: "integer", minimum: 1 } };
const candidate = strings(object({ path, expected }));
export const COWORK_INPUTS: Record<string, object> = {
  "register": object({ label: { ...text, maxLength: 160 } }),
  "task-start": object({ project_id: identifier, outcome: text, scope: { ...strings(path), minItems: 1 }, acceptance: strings(text), constraints: strings(text) }),
  "task-resume": object({ project_id: identifier, task_id: identifier, session: bound.session, after: integer, budget: { type: "integer", minimum: 1024, maximum: 65536 } }, ["project_id", "task_id"]),
  "task-show": object(bound),
  "task-checkpoint": object({ ...bound, ...version, summary: text, next: { type: "string", maxLength: 8000 }, evidence: { ...strings(identifier), description: "Evidence IDs returned by task-show, not check run IDs. Use an empty array if none; describe run IDs in the summary." } }),
  "file-read": object({ ...bound, path, offset: integer, length: { type: "integer", minimum: 1, maximum: 65536 } }, [...Object.keys(bound), "path"]),
  "file-apply": object({ ...bound, ...version, edits: { ...strings({ oneOf: [object({ path, expected, text: { type: "string", maxLength: 1_048_576 } }), object({ path, expected, delete: { const: true } })] }), minItems: 1 } }),
  "skill-read": object({ ...bound, path }),
  "context": object({ ...bound, ...version, question: text, retrieval: { enum: ["none", "local", "semantic"] } }),
  "check-start": object({ ...bound, ...version, candidate: { ...candidate, minItems: 1 } }),
  "check-status": object({ ...bound, run_id: identifier }),
  "check-output": object({ ...bound, run_id: identifier }),
  "check-cancel": object({ ...bound, ...version, run_id: identifier }),
  "commit": object({ ...bound, ...version, candidate: { ...candidate, minItems: 1 }, message: text }),
  "commit-status": object({ ...bound, request_id: identifier }),
};

/** Input errors never echo file contents, questions or credential-like strings. */
export function parseCoworkRequest(operation: string, value: unknown): Record<string, unknown> {
  if (!coworkEffect(operation) || !COWORK_INPUTS[operation] || schemaErrors(COWORK_INPUTS[operation]!, value).length)
    throw new Error("cowork-request-invalid");
  return value as Record<string, unknown>;
}
export async function readCoworkStdin(operation: string, stream: AsyncIterable<Buffer | string> = process.stdin) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 5 * 1024 * 1024) throw new Error("cowork-request-too-large");
    chunks.push(bytes);
  }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new Error("cowork-request-invalid-json"); }
  return parseCoworkRequest(operation, value);
}
