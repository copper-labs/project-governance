import { test } from "node:test";
import assert from "node:assert/strict";
import { schemaErrors } from "../src/schema-validation.ts";

test("repeated checker runs validate supplied schema content even when schema IDs repeat", () => {
  const schema = { $id: "https://example.invalid/repeated-schema", type: "object", properties: { value: { type: "string" } }, required: ["value"] };
  assert.deepEqual(schemaErrors(schema, { value: "valid" }), []);
  assert.deepEqual(schemaErrors(structuredClone(schema), { value: "valid" }), []);
  const changed = { ...schema, properties: { value: { type: "number" } } };
  assert.ok(schemaErrors(changed, { value: "invalid" }).length);
  assert.deepEqual(schemaErrors(changed, { value: 1 }), []);
});
