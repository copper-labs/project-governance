import { test } from "node:test";
import assert from "node:assert/strict";
import { exclusiveSegments, sourceSizePolicy, sourceUnitFindings, metricKey, type StructuralAnalysis, type UnitSelection } from "../src/checkers/source-units.ts";
const selection: UnitSelection = { path: "src/example.ts", isNew: false, explicit: false, renamed: false, ranges: [[250, 250]] };
const config = { version: 2, owner: "team", dispositions: [] };
const analyze = (selection: UnitSelection, analysis: StructuralAnalysis | null, lines = 800) => sourceUnitFindings(selection, analysis, lines, 500, {}, "a".repeat(64), config, "2026-09-20");

test("nested source extents do not double-count enclosing architectural units", () => {
  assert.deepEqual(exclusiveSegments(1, 20, [[3, 7], [6, 10], [15, 17]]), [[1, 2], [11, 14], [18, 20]]);
  const parsed: StructuralAnalysis = { extents: [{ kind: "type", name: "Outer", start: 1, end: 800 }, { kind: "type", name: "Outer.Inner", start: 200, end: 750 }], metrics: new Map(), capabilities: new Set() };
  const findings = analyze(selection, parsed);
  assert.deepEqual(findings.map(f => [f.rule_id, f["symbol"], f["actual"]]), [["quality.large-type", "Outer.Inner", 551]]);
});

test("pure rename reviews architecture but does not rescan untouched functions", () => {
  const parsed: StructuralAnalysis = { extents: [{ kind: "function", name: "oldFunction", start: 1, end: 200 }], metrics: new Map([[metricKey("oldFunction", 1), [30, 40, 8]]]), capabilities: new Set(["cyclomatic-complexity"]) };
  assert.deepEqual(analyze({ ...selection, renamed: true, ranges: [] }, parsed, 200), []);
  const touched = analyze({ ...selection, ranges: [[10, 10]] }, parsed, 200);
  assert.deepEqual(touched.map(f => f.rule_id), ["quality.large-function", "quality.high-cyclomatic"]);
});

test("parser-free source retains size review and the policy cannot raise the shared ceiling", () => {
  assert.equal(analyze(selection, null)[0]!.rule_id, "quality.large-file");
  assert.deepEqual(analyze({ ...selection, ranges: [] }, null), []);
  assert.equal(sourceSizePolicy("policy.yaml", 700, 700).limit, 500);
  assert.equal(sourceSizePolicy("policy.yaml", 500, 400).findings.length, 1);
});
