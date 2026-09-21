import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispositionFor, dispositionIntegrity, validateDispositions, type DispositionConfig, type DispositionEvidence } from "../src/checkers/quality-dispositions.ts";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/quality-disposition.schema.json", import.meta.url), "utf8"));
const base = { finding: "quality.large-file", path: "src/parser.ts", symbol: "<file>", disposition: "refactor-required", owner: "team", reviewer: "reviewer", approved_on: "2026-09-20", responsibility: "Parse the declared input grammar without external effects.", rationale: "Explicit review found this responsibility needs decomposition." };
const config = (...dispositions: Record<string, unknown>[]): DispositionConfig => ({ version: 2, owner: "team", dispositions });
const evidence = (overrides: Partial<DispositionEvidence> = {}): DispositionEvidence => ({ prior: null, historyError: "", renamed: new Map(), removed: new Set(), symbols: new Map(), sourceFingerprints: new Map(), observed: new Set(), mode: "changed", exists: () => true, today: "2026-09-20", ...overrides });

test("review acceptance is stable; temporary waiver requires exact source and current metric", () => {
  const accepted = config({ ...base, disposition: "cohesion-accepted" });
  assert.equal(validateDispositions(accepted as unknown as Record<string, unknown>, schema, "decisions.yaml").findings.length, 0);
  assert.equal(dispositionFor(base.finding, base.path, base.symbol, 900, "b".repeat(64), accepted, "2026-09-20")[0], true);
  const temporary = config({ ...base, disposition: "temporary-waiver", current_value: 600, source_fingerprint: "sha256:" + "a".repeat(64), expires: "2026-10-01", remediation_plan: "Split parsing and transport responsibilities in the next planned implementation batch." });
  assert.equal(dispositionFor(base.finding, base.path, base.symbol, 600, "a".repeat(64), temporary, "2026-09-20")[0], true);
  assert.equal(dispositionFor(base.finding, base.path, base.symbol, 601, "a".repeat(64), temporary, "2026-09-20")[0], false);
  assert.equal(dispositionFor(base.finding, base.path, base.symbol, 600, "b".repeat(64), temporary, "2026-09-20")[0], false);
  assert.equal(dispositionFor(base.finding, base.path, base.symbol, 600, "a".repeat(64), temporary, "2026-10-02")[0], false);
});

test("old schemas and duplicate identities cannot grant maintainability exceptions", () => {
  assert.equal(validateDispositions({ version: 1, dispositions: [base] }, schema, "decisions.yaml").findings[0]!.rule_id, "quality.disposition-migration-required");
  const duplicate = validateDispositions(config(base, base) as unknown as Record<string, unknown>, schema, "decisions.yaml");
  assert.ok(duplicate.findings.some(f => f.rule_id === "quality.disposition-identity"));
  assert.equal(duplicate.config.dispositions.length, 0);
});

test("renaming or deleting registry decisions cannot silently resolve active refactoring", () => {
  const prior = config(base);
  const removed = dispositionIntegrity(config(), "decisions.yaml", evidence({ prior }));
  assert.equal(removed[0]!.rule_id, "quality.disposition-transition-required");
  const moved = config({ ...base, path: "src/grammar.ts" });
  assert.deepEqual(dispositionIntegrity(moved, "decisions.yaml", evidence({ prior, renamed: new Map([[base.path, "src/grammar.ts"]]) })), []);
  const orphaned = dispositionIntegrity(prior, "decisions.yaml", evidence({ removed: new Set([base.path]) }));
  assert.equal(orphaned[0]!.rule_id, "quality.disposition-relocation-required");
  const untouchedDecision = dispositionIntegrity(prior, "decisions.yaml", evidence({ symbols: new Map([[base.path, new Set([base.symbol])]]) }));
  assert.equal(untouchedDecision[0]!.rule_id, "quality.refactor-required");
});
