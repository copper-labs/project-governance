/** The existing outcome manifest owns captures; these types describe its optional report extension. */
export const RELEASE_DIMENSIONS = ["installation", "entry", "index", "selection", "checks", "device", "consultation", "cleanup", "whole-task"] as const;
export type ReleaseDimension = typeof RELEASE_DIMENSIONS[number];
export type EvaluationVerdict = "improved" | "regressed" | "unchanged" | "mixed" | "insufficient evidence";
export interface EvaluationReference { path: string; digest: string }
export interface EvaluationCondition {
  id: string;
  runtime: { version: string; archiveDigest: string };
  sourceDigest: string | null; profileDigest: string | null; questionDigest: string | null;
  permissionsDigest: string | null; environmentDigest: string | null; budgetDigest: string | null;
  model: string | null; effort: string | null; cacheState: "cold" | "warm" | "unknown";
  arm: "code-only" | "jev-active" | "shadow" | "field";
}
export interface EvaluationEnvelope {
  version: 1; metricContract: "release-evaluation-1";
  suite: { version: string; digest: string };
  view: "controlled" | "field";
  conditions: EvaluationCondition[];
  population: { eligiblePrompts: number | null };
  discovery: { scanComplete: boolean | null; projectionEvicted: number | null };
  comparison: { baseline: string; candidate: string; kind: "release" | "jev"; minimumChange: number } | null;
}
export interface EvaluationMeasure {
  dimension: ReleaseDimension; unitId: string; expected: string; observed: string | null;
  reason: string | null; critical: boolean; provenance: "native-receipt" | "fixture-oracle" | "host-observer" | "operator-source";
  reference: EvaluationReference;
}
export interface EvaluationCost {
  id: string; owner: "native-response" | "provider-job" | "jev-reservation";
  provider: string; inputTokens: number | null; freshInputTokens: number | null;
  cachedInputTokens: number | null; cacheCreationInputTokens: number | null;
  outputTokens: number | null; reasoningTokens: number | null;
  estimatedUSD: number | null; durationMs: number | null;
  allocation: "episode" | "turn-unallocated" | "unallocated";
  requestedModel: string | null; reportedModels: string[] | null;
  scopeKey: string | null;
  accounting: string; reference: EvaluationReference;
}
export interface EvaluationIssue { episode: string | null; code: string; reference: EvaluationReference | null }
export const CONTEXT_TIME_METRICS = ["preparationMs", "sourceCaptureMs", "indexMs", "selectionMs", "metadataDecisionWorkMs", "deliveryMs", "totalMs",
  "indexIdentityMs", "indexFreshnessMs", "indexCacheMs", "indexExtractionMs", "indexPublicationAndLinksMs",
  "metadataElapsedMs", "metadataHttpWorkMs", "metadataAdmissionWorkMs", "metadataPackingMs", "passageElapsedMs", "passagePreparationMs", "passagePackingMs"] as const;
export interface EvaluationContextTiming {
  id: string; reference: EvaluationReference;
  index: { cache: string | null; extractedCount: number | null; reusedCount: number | null; pendingCount: number | null;
    workload: "extraction-only" | "reuse-only" | "mixed" | "empty-or-unobserved" | "unknown" };
  phases: Record<typeof CONTEXT_TIME_METRICS[number], number | null>;
}
export interface EvaluationEpisode {
  id: string; conditionId: string | null; caseId: string | null; trialId: string | null;
  inputDigest: string | null; expectedLabelDigest: string | null;
  lifecycle: "assigned" | "started" | "terminal";
  joined: boolean; scope: { workspace: string; taskId: string; taskRevision: string } | null;
  observedGenerations: string[]; observedArchiveDigests: string[]; generationIncomplete: number;
  generation: "matched" | "mixed" | "different" | "unknown";
  measures: EvaluationMeasure[]; costs: EvaluationCost[];
  contextTimings: EvaluationContextTiming[];
  executionCosts: Array<{ id: string; state: string | null; cleanup: string | null; durationMs: number | null; reference: EvaluationReference }>;
  acceptance: "accepted" | "reopened" | "rejected" | "unknown";
  acceptanceProvenance: string | null;
  usagePopulation: string[] | null; costCaptureUnknown: boolean;
  elapsedMs: number | null; reworkMinutes: number | null; interventions: number | null;
  additionalReads: number | null; readCoverage: "observed-only" | "unknown";
  selectionQuality: Record<string, unknown> | null;
  sources: EvaluationReference[];
  exposure: { configuredMode: string | null; mode: string | null; reason: string | null; delivered: boolean | null } | null;
}
export interface ReleaseEvaluationInput {
  envelope: EvaluationEnvelope; manifest: EvaluationReference;
  episodes: EvaluationEpisode[]; issues: EvaluationIssue[];
  readBytes: number; duplicateEpisodes: number;
  provenance: "hash-verified-explicit-outcome-manifest";
}
