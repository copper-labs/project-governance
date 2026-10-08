import { digest } from "../../src/core.ts";
import { contextQualityLabelDigest, qualitySourceDigest } from "../../src/context-evaluation-quality.ts";
import type { ContextQualityLabels, ContextQualitySource, ContextQualityUnit } from "../../src/context-evaluation-quality.ts";
import type { ContextEvaluationCase } from "../../src/context-evaluation.ts";
import type { Span } from "../../src/context-excerpts.ts";

const source = (candidateId: string, text: string, description: string): ContextQualitySource => ({
  candidateId, text, sourceDigest: qualitySourceDigest(text), bodyPermission: "permitted", exclusionReason: null,
  description: { text: description, quality: "accurate" },
});
const unit = (id: string, input: ContextQualitySource, firstLine: number, lastLine: number,
  relevance: ContextQualityUnit["relevance"]): ContextQualityUnit => ({
  id, candidateId: input.candidateId, firstLine, lastLine, relevance,
  rangeDigest: qualitySourceDigest(input.text.split(/(?<=\n)/u).slice(firstLine - 1, lastLine).join("")),
});

const guard = [
  "export function admitCompletion(observed, active) {\n",
  "  if (resolveIdentity(observed) !== active.identity) return false;\n",
  "  active.pending += 1;\n",
  "  return true;\n",
  "}\n",
];
const unrelated = Array.from({ length: 3200 }, (_, index) =>
  `// Archived palette setting ${index}: this decorative value has no session ownership or settlement behavior.\n`);
const settlement = [
  "export async function settleCompletion(observed, active) {\n",
  "  await observed.finished;\n",
  "  if (resolveIdentity(observed) !== active.identity) return false;\n",
  "  active.pending -= 1;\n",
  "  if (active.pending === 0) active.lockOwner = null;\n",
  "  return true;\n",
  "}\n",
];
const guidance = source("AGENTS.md", "# Required guidance\nKeep replacement ownership intact until its own work settles.\n", "Required ownership guidance.");
const sectioned = source("src/completion-controller.ts", [...guard, ...unrelated, ...settlement].join(""), "Admission and settlement of asynchronous completions.");
// This helper's title does not describe its role. Its body is necessary to interpret both guards.
const helper = source("src/value-helper.ts", "export function resolveIdentity(event) {\n  return `${event.sessionId}:${event.generation}`;\n}\n", "Value helpers.");
helper.description!.quality = "weak";
const distractor = source("docs/session-ownership.md", "# Session ownership and completion\nThe dashboard displays the most recent session name.\nThis text specifies presentation only; it defines no completion guard or lock release.\n", "Session dashboard presentation.");
const nearMiss = source("src/peripheral-completion.ts", "export function settlePeripheralConnection(peripheral) {\n  peripheral.connectionName = null;\n  return true;\n}\n", "Completes a peripheral connection; it does not settle a session generation.");

const laterStart = guard.length + unrelated.length + 1;
export const sectionedEvidenceSpans: Span[] = [
  { kind: "function", name: "admitCompletion", start: 1, end: guard.length },
  { kind: "function", name: "settleCompletion", start: laterStart, end: laterStart + settlement.length - 1 },
];
const sources = [guidance, sectioned, helper, distractor, nearMiss];
const candidates = sources.map(input => ({ id: input.candidateId, sourceDigest: input.sourceDigest, excerpt: input.text }));
const request = {
  taskRevision: "sectioned-completion-1",
  purpose: "Explain why a late completion cannot decrement or release a replacement session. Inspect admission, final settlement and how completion identity is resolved; peripheral disconnection and dashboard labels do not answer this.",
  required: [candidates[0]!], optional: candidates.slice(1), maximumBytes: 8192, optionalExcerptBytes: 1024,
};
const body: Omit<ContextQualityLabels, "labelDigest"> = {
  version: 1, suiteVersion: "selection-quality-large-sectioned-4-2-1", inputDigest: digest(request),
  labelSource: { kind: "source-backed-fixture", reference: "synthetic-quality:large-sectioned-completion:authored-labels", independentOfSelector: true },
  sources,
  units: [unit("required-guidance", guidance, 1, 2, "useful"),
    unit("admission-guard", sectioned, 1, guard.length, "useful"),
    unit("unrelated-intervening-sections", sectioned, guard.length + 1, laterStart - 1, "irrelevant"),
    unit("settlement-guard", sectioned, laterStart, laterStart + settlement.length - 1, "useful"),
    unit("identity-helper", helper, 1, 3, "useful"), unit("matching-title-only", distractor, 1, 3, "irrelevant"),
    unit("different-completion-domain", nearMiss, 1, 4, "irrelevant")],
  essentialGroups: [
    { id: "mandatory-guidance", unitIds: ["required-guidance"], required: true },
    { id: "admission-owner-rule", unitIds: ["admission-guard"], required: false },
    { id: "settlement-owner-rule", unitIds: ["settlement-guard"], required: false },
    { id: "generation-identity", unitIds: ["identity-helper"], required: false },
  ], noMatch: false, fullyLabeled: true,
};

/** Labels are authored from the original contract, never from confidence or selected excerpts. */
export const largeSectionedContextCase: ContextEvaluationCase = {
  id: "large-sectioned-completion", request, usefulOptionalIds: [sectioned.candidateId, helper.candidateId],
  qualityLabels: { ...body, labelDigest: contextQualityLabelDigest(body) },
};
