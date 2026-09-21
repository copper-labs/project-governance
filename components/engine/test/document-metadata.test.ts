import { test } from "node:test";
import assert from "node:assert/strict";
import { documentMetadata } from "../src/checkers/document-metadata.ts";
const source = "---\nid: example\ntitle: Example\ntype: spec\nstatus: active\nowner: team\ncreated: 2026-09-19\nupdated: 2026-09-20\nsummary: Example specification\n---\nBody\n";

test("document metadata enforces identity, calendar dates and lesson lifecycle", () => {
  const seen = new Map<string, string>();
  assert.deepEqual(documentMetadata("docs/a.md", source, seen).errors, []);
  assert.ok(documentMetadata("docs/b.md", source, seen).errors.some(error => error.includes("duplicate")));
  assert.ok(documentMetadata("docs/a.md", source.replace("updated: 2026-09-20", "updated: 2026-02-30"), new Map()).errors.some(error => error.includes("ISO date")));
  assert.ok(documentMetadata("docs/a.md", source.replace("updated: 2026-09-20", "updated: 2026-09-18"), new Map()).errors.some(error => error.includes("on or after")));
  const lesson = documentMetadata("docs/lesson.md", source.replace("type: spec", "type: lesson"), new Map());
  assert.ok(lesson.errors.some(error => error.includes("missing lesson")));
  assert.ok(lesson.errors.some(error => error.includes("evidence_links")));
});
