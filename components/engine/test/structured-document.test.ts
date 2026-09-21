import { test } from "node:test";
import assert from "node:assert/strict";
import { structuredDocument } from "../src/structured-document.ts";
const read = (text: string, format: "yaml" | "json" = "yaml") => structuredDocument(Buffer.from(text), format);

test("bounded authorities preserve YAML 1.1 scalar and nonoverlapping merge behavior", () => {
  assert.equal(JSON.stringify(read('flag: yes\nquoted: "yes"\nbase: &base {id: capture}\ncopy: {<<: *base, summary: capture flow}\n')),
    JSON.stringify({ flag: true, quoted: "yes", base: { id: "capture" }, copy: { id: "capture", summary: "capture flow" } }));
  assert.throws(() => read('base: &base {id: capture}\ncopy: {<<: *base, id: replaced}\n'), /Duplicate/);
  assert.throws(() => read('base: &base {id: capture}\ncopy: {<<: [*base, *base]}\n'), /Duplicate/);
  assert.throws(() => read('id: first\nid: second\n'));
  assert.throws(() => read('{"id":"first","id":"second"}', "json"));
  assert.throws(() => read('id: not-json', "json"));
});

test("recursive aliases, unsafe key coercion, depth, expansion, scalar and byte excess fail closed", () => {
  assert.throws(() => read('value: &value [*value]\n'), /Recursive/);
  assert.throws(() => read('? [kind]\n: kmp-surface-validation\n'), /keys must be strings/);
  assert.throws(() => read('['.repeat(33) + '0' + ']'.repeat(33)), /nesting/);
  assert.throws(() => read('value: ' + 'a'.repeat(16385)), /string limit/);
  assert.throws(() => read(' '.repeat(256 * 1024 + 1)), /byte limit/);
  assert.throws(() => structuredDocument(Buffer.from([0xff]), "yaml"));
  const expanded = ['a: &a [1,2,3,4,5,6,7,8,9,0]'];
  for (let index = 1; index < 6; index++) expanded.push(`${String.fromCharCode(97 + index)}: &${String.fromCharCode(97 + index)} [${Array(10).fill('*' + String.fromCharCode(96 + index)).join(',')}]`);
  assert.throws(() => read(expanded.join('\n')), /limit/);
});
