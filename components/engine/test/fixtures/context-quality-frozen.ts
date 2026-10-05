import { digest } from "../../src/core.ts";
import type { ContextEvaluationCase } from "../../src/context-evaluation.ts";
import { contextQualityLabelDigest, qualitySourceDigest, type ContextQualityLabels, type ContextQualitySource, type ContextQualityUnit } from "../../src/context-evaluation-quality.ts";

/** Authored source-backed expectations are separate from the selector and never sent to it. */
const source = (candidateId: string, text: string, permission: ContextQualitySource["bodyPermission"] = "permitted"): ContextQualitySource => ({
  candidateId, text, sourceDigest: qualitySourceDigest(text), bodyPermission: permission, exclusionReason: permission === "excluded" ? "local-body-scope-denied" : null,
});
const unit = (id: string, input: ContextQualitySource, firstLine: number, lastLine: number, relevance: ContextQualityUnit["relevance"]): ContextQualityUnit => ({
  id, candidateId: input.candidateId, firstLine, lastLine, rangeDigest: qualitySourceDigest((input.text.match(/[^\n]*\n|[^\n]+$/gu) ?? []).slice(firstLine - 1, lastLine).join("")), relevance,
});
const fixture = (id: string, purpose: string, sources: ContextQualitySource[], units: ContextQualityUnit[],
  essentialGroups: ContextQualityLabels["essentialGroups"], options: { required?: string[]; noMatch?: boolean; maximumBytes?: number; holdout?: boolean } = {}): ContextEvaluationCase => {
  const candidates = sources.filter(item => item.bodyPermission !== "excluded").map(item => ({ id: item.candidateId, sourceDigest: item.sourceDigest, excerpt: item.text }));
  const request = { taskRevision: `${id}-current`, purpose, maximumBytes: options.maximumBytes ?? 20_000,
    required: candidates.filter(item => options.required?.includes(item.id)), optional: candidates.filter(item => !options.required?.includes(item.id)) };
  const body: Omit<ContextQualityLabels, "labelDigest"> = { version: 1, suiteVersion: options.holdout ? "selection-quality-holdout-1" : "selection-quality-development-1",
    inputDigest: digest(request), labelSource: { kind: "source-backed-fixture", reference: `synthetic-quality:${id}:authored-labels`, independentOfSelector: true },
    sources, units, essentialGroups, noMatch: options.noMatch ?? false, fullyLabeled: true };
  return { id, request, usefulOptionalIds: [...new Set(units.filter(item => item.relevance === "useful" && !options.required?.includes(item.candidateId)).map(item => item.candidateId))],
    qualityLabels: { ...body, labelDigest: contextQualityLabelDigest(body) } };
};

const owner = source("src/lease.ts", "export function style() {\n  return 'blue';\n}\nexport function release(lease) {\n  lease.owner = null;\n  lease.closed = true;\n}\n");
const support = source("src/retry.ts", "export function retry(status) {\n  return status === 'temporary';\n}\n");
const counter = source("test/retry.test.ts", "test('permanent denial stays denied', () => {\n  assert.equal(retry('denied'), false);\n});\n");
const weak = { ...source("src/converter.ts", "export function convert(value) {\n  return value * 1000;\n}\n"), description: { text: "Miscellaneous helpers", quality: "weak" as const } };
const checkpoint = source("docs/checkpoint.md", "# Current checkpoint\nCleanup remains uncertain.\nNext: verify the owned process exited.\n");
const stale = source("docs/previous.md", "# Previous objective\nChange the theme color.\n");
const required = source("AGENTS.md", "# Required instructions\nDo not publish without operator authorization.\nKeep cleanup uncertainty visible.\n");
const irrelevant = source("docs/theme.md", "# Theme guide\nUse a blue highlight.\n");
const denied = source("src/excluded.ts", "export function restrictedCondition() {\n  return 'decisive';\n}\n", "excluded");
const equivalent = source("docs/retry-contract.md", "# Retry contract\nOnly temporary status permits a retry.\n");

export const contextQualityDevelopment: ContextEvaluationCase[] = [
  fixture("right-path-wrong-passage", "Inspect release of an owned lease", [owner], [unit("style", owner, 1, 3, "irrelevant"), unit("release", owner, 4, 7, "useful")], [{ id: "lease-release", unitIds: ["release"], required: false }]),
  fixture("counter-evidence", "Check retry behavior and permanent denial", [support, counter], [unit("retry", support, 1, 3, "useful"), unit("denial", counter, 1, 3, "useful")],
    [{ id: "retry-rule", unitIds: ["retry"], required: false }, { id: "contrary-case", unitIds: ["denial"], required: false }]),
  fixture("weak-description", "Find unit conversion", [weak], [unit("conversion", weak, 1, 3, "useful")], [{ id: "conversion-rule", unitIds: ["conversion"], required: false }]),
  fixture("short-resume", "Continue", [checkpoint, stale], [unit("active-checkpoint", checkpoint, 1, 3, "useful"), unit("old-objective", stale, 1, 2, "irrelevant")], [{ id: "current-next-action", unitIds: ["active-checkpoint"], required: false }]),
  fixture("steering-multi-intent", "Now inspect cleanup and retry denial; the theme task is complete", [owner, counter, stale],
    [unit("old-style", owner, 1, 3, "irrelevant"), unit("new-cleanup", owner, 4, 7, "useful"), unit("new-denial", counter, 1, 3, "useful"), unit("previous-theme", stale, 1, 2, "irrelevant")],
    [{ id: "cleanup-intent", unitIds: ["new-cleanup"], required: false }, { id: "denial-intent", unitIds: ["new-denial"], required: false }]),
];

export const contextQualityHoldout: ContextEvaluationCase[] = [
  fixture("no-match", "Find a database migration", [irrelevant], [unit("theme-only", irrelevant, 1, 2, "irrelevant")], [], { noMatch: true, maximumBytes: 2, holdout: true }),
  fixture("permission-exclusion", "Find the decisive restricted condition", [denied, irrelevant], [unit("restricted", denied, 1, 3, "useful"), unit("unrelated", irrelevant, 1, 2, "irrelevant")],
    [{ id: "restricted-condition", unitIds: ["restricted"], required: false }], { holdout: true }),
  fixture("complete-required-evidence", "Inspect cleanup while preserving required instructions", [required, owner],
    [unit("instructions", required, 1, 3, "useful"), unit("other-style", owner, 1, 3, "irrelevant"), unit("required-release", owner, 4, 7, "useful")],
    [{ id: "mandatory-guidance", unitIds: ["instructions"], required: true }, { id: "cleanup-proof", unitIds: ["required-release"], required: false }], { required: ["AGENTS.md"], holdout: true }),
  fixture("equivalent-sources", "Find the retry rule", [support, equivalent], [unit("implementation", support, 1, 3, "useful"), unit("contract", equivalent, 1, 2, "useful")],
    [{ id: "one-retry-rule", unitIds: ["implementation", "contract"], required: false }], { holdout: true }),
];
