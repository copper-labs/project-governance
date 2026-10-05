import { createHash } from "node:crypto";
import { canonical, digest, text } from "./core.ts";
import type { ContextPacketRequest } from "./context-packet.ts";
import type { Candidate } from "./decisions.ts";

export const CONTEXT_QUALITY_STAGES = ["inventory", "descriptor-permitted", "descriptor-submitted", "descriptor-answered", "body-permitted", "captured", "judged", "consumed"] as const;
export interface ContextQualitySource {
  candidateId: string; text: string; sourceDigest: string;
  /** Local body permission is separate from permission to disclose descriptors to a provider. */
  bodyPermission: "permitted" | "excluded" | "unknown"; exclusionReason: string | null;
  description?: { text: string | null; quality: "accurate" | "weak" | "unknown" };
}
export interface ContextQualityUnit {
  id: string; candidateId: string; firstLine: number; lastLine: number; rangeDigest: string;
  relevance: "useful" | "irrelevant" | "unknown";
}
export interface ContextQualityLabels {
  version: 1; suiteVersion: string; inputDigest: string; labelDigest: string;
  labelSource: { kind: "operator" | "source-backed-fixture"; reference: string; independentOfSelector: true };
  sources: ContextQualitySource[]; units: ContextQualityUnit[];
  /** Alternatives satisfy one evidence need; duplication never earns another essential hit. */
  essentialGroups: Array<{ id: string; unitIds: string[]; required: boolean }>;
  noMatch: boolean; fullyLabeled: boolean;
}
export interface ContextQualityObservation {
  stages: Array<{ stage: typeof CONTEXT_QUALITY_STAGES[number]; candidateIds: string[];
    omissions: Array<{ candidateId: string; reason: string }> }>;
  judgments?: Array<{ unitId: string; value: "positive" | "uncertain" | "negative" | "invalid" | "unavailable" | "omitted" }>;
}
export interface ContextQualityScore {
  suiteVersion: string; inputDigest: string; labelDigest: string; labelSource: ContextQualityLabels["labelSource"];
  essentialGroups: { expected: number; fileDelivered: number; completeDelivered: number; missed: string[]; recall: number | null };
  conditionalAvailablePermitted: { expected: number; completeDelivered: number; recall: number | null };
  requiredMissing: string[]; invalidSources: Array<{ candidateId: string; reason: string }>;
  permissionExclusions: Array<{ candidateId: string; reason: string }>;
  precision: { usefulSelected: number; selected: number; unknown: number; unlabelled: number; rate: number | null };
  noMatch: { expected: boolean; correct: boolean | null; optionalSelected: number };
  descriptors: { present: number; accurate: number; weak: number; unknown: number };
  boundaries: Array<{ stage: typeof CONTEXT_QUALITY_STAGES[number] | "delivered"; expectedSources: number; observed: number | null;
    omissions: Array<{ candidateId: string; reason: string }> }>;
  judgments: Record<"positive" | "uncertain" | "negative" | "invalid" | "unavailable" | "omitted", number> | null;
}

/** Source identities hash literal UTF-8 bytes; label identities hash canonical JSON. */
export const qualitySourceDigest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const lines = (value: string) => value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
export function contextQualityLabelDigest(labels: Omit<ContextQualityLabels, "labelDigest"> | ContextQualityLabels): string {
  const { labelDigest: _labelDigest, ...body } = labels as ContextQualityLabels;
  return digest(body);
}

/** Validate independent frozen labels before the existing evaluator can call any provider. */
export function validateContextQualityLabels(request: ContextPacketRequest, labels: ContextQualityLabels, observation?: ContextQualityObservation): void {
  if (labels.version !== 1 || labels.inputDigest !== digest(request) || labels.labelDigest !== contextQualityLabelDigest(labels))
    throw new Error("Quality label version, input or label digest mismatch");
  text(labels.suiteVersion, "quality suite version", 128);
  if (!["operator", "source-backed-fixture"].includes(labels.labelSource?.kind) || labels.labelSource.independentOfSelector !== true)
    throw new Error("Quality labels need an independent label source");
  text(labels.labelSource.reference, "quality label source", 4096);
  if (typeof labels.noMatch !== "boolean" || typeof labels.fullyLabeled !== "boolean" ||
      !Array.isArray(labels.sources) || labels.sources.length > 1000 || !Array.isArray(labels.units) || labels.units.length > 1000 ||
      !Array.isArray(labels.essentialGroups) || labels.essentialGroups.length > 1000) throw new Error("Invalid quality label bounds");
  const sources = new Map<string, ContextQualitySource>();
  let sourceBytes = 0;
  for (const source of labels.sources) {
    text(source.candidateId, "quality source id");
    if (sources.has(source.candidateId) || typeof source.text !== "string" || source.sourceDigest !== qualitySourceDigest(source.text))
      throw new Error("Quality source identity mismatch or duplicate");
    if (!["permitted", "excluded", "unknown"].includes(source.bodyPermission) ||
        (source.bodyPermission === "excluded" ? !source.exclusionReason : source.exclusionReason !== null)) throw new Error("Invalid quality body permission");
    if (source.exclusionReason !== null) text(source.exclusionReason, "quality exclusion reason", 512);
    if (source.description && (!["accurate", "weak", "unknown"].includes(source.description.quality) ||
        (source.description.text !== null && typeof source.description.text !== "string"))) throw new Error("Invalid quality description label");
    sourceBytes += Buffer.byteLength(source.text);
    sources.set(source.candidateId, source);
  }
  if (sourceBytes > 2 * 1024 * 1024) throw new Error("Quality frozen sources exceed bound");
  const units = new Map<string, ContextQualityUnit>(), coordinates = new Set<string>();
  for (const unit of labels.units) {
    text(unit.id, "quality unit id", 256);
    const source = sources.get(unit.candidateId);
    const coordinate = canonical([unit.candidateId, unit.firstLine, unit.lastLine]);
    if (units.has(unit.id) || coordinates.has(coordinate) || !source || !Number.isSafeInteger(unit.firstLine) || unit.firstLine < 1 ||
        !Number.isSafeInteger(unit.lastLine) || unit.lastLine < unit.firstLine || unit.lastLine > lines(source.text).length ||
        unit.rangeDigest !== qualitySourceDigest(lines(source.text).slice(unit.firstLine - 1, unit.lastLine).join("")) ||
        !["useful", "irrelevant", "unknown"].includes(unit.relevance)) throw new Error("Quality unit identity, range or relevance mismatch");
    if ([...units.values()].some(other => other.candidateId === unit.candidateId && other.firstLine <= unit.lastLine && other.lastLine >= unit.firstLine))
      throw new Error("Quality units overlap; label complete evidence once");
    units.set(unit.id, unit); coordinates.add(coordinate);
  }
  const groupIds = new Set<string>(), groupedUnits = new Set<string>();
  for (const group of labels.essentialGroups) {
    text(group.id, "quality evidence group", 256);
    if (groupIds.has(group.id) || typeof group.required !== "boolean" || !Array.isArray(group.unitIds) || !group.unitIds.length ||
        new Set(group.unitIds).size !== group.unitIds.length || group.unitIds.some(id => !units.has(id) || units.get(id)!.relevance !== "useful" || groupedUnits.has(id)))
      throw new Error("Invalid or duplicate quality evidence group");
    for (const id of group.unitIds) groupedUnits.add(id);
    groupIds.add(group.id);
  }
  if (labels.noMatch && (labels.essentialGroups.some(group => !group.required) || labels.units.some(unit =>
    unit.relevance === "useful" && !request.required.some(candidate => candidate.id === unit.candidateId)))) throw new Error("No-match labels contain useful optional evidence");
  for (const candidate of [...request.required, ...request.optional]) {
    const source = sources.get(candidate.id);
    if (!source || source.bodyPermission === "excluded" || candidateValidity(candidate, source) !== null)
      throw new Error("Quality request contains unverified or permission-excluded source");
  }
  for (const group of labels.essentialGroups.filter(group => group.required)) if (!group.unitIds.some(id =>
    request.required.some(candidate => candidate.id === units.get(id)!.candidateId))) throw new Error("Required quality group has no required request source");
  if (observation) {
    if (!Array.isArray(observation.stages) || observation.stages.length > CONTEXT_QUALITY_STAGES.length) throw new Error("Invalid quality observations");
    const stages = new Set<string>();
    for (const item of observation.stages) {
      if (!(CONTEXT_QUALITY_STAGES as readonly string[]).includes(item.stage) || stages.has(item.stage) || !Array.isArray(item.candidateIds) ||
          new Set(item.candidateIds).size !== item.candidateIds.length || item.candidateIds.some(id => !sources.has(id)) || !Array.isArray(item.omissions) ||
          item.omissions.length > 1000 || item.omissions.some(omission => !sources.has(omission.candidateId) || item.candidateIds.includes(omission.candidateId)))
        throw new Error("Invalid quality boundary observation");
      for (const omission of item.omissions) text(omission.reason, "quality omission reason", 512);
      if (new Set(item.omissions.map(omission => omission.candidateId)).size !== item.omissions.length ||
          item.stage === "body-permitted" && item.candidateIds.some(id => sources.get(id)!.bodyPermission !== "permitted"))
        throw new Error("Quality boundary repeats an omission or contradicts body permission");
      stages.add(item.stage);
    }
    if (observation.judgments && (observation.judgments.length > 1000 || new Set(observation.judgments.map(item => item.unitId)).size !== observation.judgments.length ||
        observation.judgments.some(item => !units.has(item.unitId) || !["positive", "uncertain", "negative", "invalid", "unavailable", "omitted"].includes(item.value))))
      throw new Error("Invalid quality judgment observation");
  }
}

function candidateValidity(candidate: Candidate, source: ContextQualitySource): string | null {
  if (candidate.sourceDigest !== source.sourceDigest) return "source-digest-mismatch";
  const sourceLines = lines(source.text), ranges = candidate.sourceRanges ?? (candidate.sourceRange ? [candidate.sourceRange] : []);
  if (!ranges.length) return candidate.excerpt === source.text ? null : "unranged-text-is-not-original";
  const seenRanges: Array<{ firstLine: number; lastLine: number }> = [];
  for (const range of ranges) {
    if (!Number.isSafeInteger(range.firstLine) || !Number.isSafeInteger(range.lastLine) || range.firstLine < 1 ||
        range.lastLine < range.firstLine || range.lastLine > sourceLines.length || range.totalLines !== sourceLines.length ||
        seenRanges.some(other => other.firstLine <= range.lastLine && other.lastLine >= range.firstLine)) return "invalid-source-range";
    const original = sourceLines.slice(range.firstLine - 1, range.lastLine).join("");
    // Existing generic excerpts hash bytes; the existing procedure owner hashes the literal JSON string.
    if (![qualitySourceDigest(original), digest(original)].includes(range.excerptDigest)) return "range-digest-mismatch";
    seenRanges.push(range);
  }
  const bodies = ranges.map(range => sourceLines.slice(range.firstLine - 1, range.lastLine).join(""));
  const framed = ranges.map((range, index) => `[source lines ${range.firstLine}-${range.lastLine}]\n${bodies[index]}`).join("\n");
  if (candidate.excerpt !== framed && !(ranges.length === 1 && candidate.excerpt === bodies[0])) return "range-text-mismatch";
  return null;
}

const candidateRanges = (candidate: Candidate, totalLines: number) => candidate.sourceRanges ?? (candidate.sourceRange ? [candidate.sourceRange] : [{ firstLine: 1, lastLine: totalLines }]);
function coversUnit(candidate: Candidate, unit: ContextQualityUnit, source: ContextQualitySource): boolean {
  const incomplete = candidate.sourceUnits?.some(item => item.firstLine === unit.firstLine && item.lastLine === unit.lastLine && !item.complete);
  return !incomplete && candidateRanges(candidate, lines(source.text).length).some(range => range.firstLine <= unit.firstLine && range.lastLine >= unit.lastLine);
}

/** Pure scoring over the existing packet. Provider confidence and answers are never grading labels. */
export function scoreContextQuality(request: ContextPacketRequest, labels: ContextQualityLabels, entries: Candidate[], observation?: ContextQualityObservation): ContextQualityScore {
  validateContextQualityLabels(request, labels, observation);
  const sources = new Map(labels.sources.map(source => [source.candidateId, source]));
  const units = new Map(labels.units.map(unit => [unit.id, unit]));
  const invalidSources: ContextQualityScore["invalidSources"] = [];
  const valid = new Map<string, Candidate>();
  for (const candidate of entries) {
    const source = sources.get(candidate.id), reason = source ? candidateValidity(candidate, source) : "unlabelled-source";
    if (reason || source?.bodyPermission === "excluded" || valid.has(candidate.id)) invalidSources.push({ candidateId: candidate.id, reason: reason ?? (valid.has(candidate.id) ? "duplicate-source" : "permission-excluded") });
    else valid.set(candidate.id, candidate);
  }
  const hasUnit = (id: string, candidates: Map<string, Candidate>) => {
    const unit = units.get(id)!, candidate = candidates.get(unit.candidateId);
    return Boolean(candidate && coversUnit(candidate, unit, sources.get(unit.candidateId)!));
  };
  const complete = labels.essentialGroups.filter(group => group.unitIds.some(id => hasUnit(id, valid)));
  const available = new Map([...request.required, ...request.optional].map(candidate => [candidate.id, candidate]));
  const eligible = labels.essentialGroups.filter(group => group.unitIds.some(id => sources.get(units.get(id)!.candidateId)!.bodyPermission === "permitted" && hasUnit(id, available)));
  const requiredMissing = request.required.filter(candidate => canonical(valid.get(candidate.id) ?? null) !== canonical(candidate)).map(candidate => candidate.id);
  const selectedUnits = labels.units.filter(unit => {
    const candidate = valid.get(unit.candidateId);
    return candidate && candidateRanges(candidate, lines(sources.get(unit.candidateId)!.text).length).some(range => range.firstLine <= unit.lastLine && range.lastLine >= unit.firstLine) &&
      !request.required.some(required => required.id === unit.candidateId);
  });
  const selectedKeys = new Set<string>(), usefulKeys = new Set<string>();
  for (const unit of selectedUnits) {
    const key = labels.essentialGroups.find(group => group.unitIds.includes(unit.id))?.id ?? unit.id;
    selectedKeys.add(key);
    if (unit.relevance === "useful" && hasUnit(unit.id, valid)) usefulKeys.add(key);
  }
  let unlabelled = invalidSources.length;
  for (const candidate of valid.values()) if (!request.required.some(required => required.id === candidate.id)) {
    const source = sources.get(candidate.id)!, sourceLines = lines(source.text);
    const sourceUnits = labels.units.filter(unit => unit.candidateId === candidate.id);
    if (candidateRanges(candidate, sourceLines.length).some(range => sourceLines.some((line, index) => line.trim() && index + 1 >= range.firstLine && index + 1 <= range.lastLine &&
      !sourceUnits.some(unit => unit.firstLine <= index + 1 && unit.lastLine >= index + 1)))) unlabelled++;
  }
  const unknown = selectedUnits.filter(unit => unit.relevance === "unknown").length;
  const optionalSelected = entries.filter(candidate => !request.required.some(required => required.id === candidate.id)).length;
  const observations = new Map(observation?.stages.map(item => [item.stage, item]));
  const boundaries: ContextQualityScore["boundaries"] = CONTEXT_QUALITY_STAGES.map(stage => ({ stage, expectedSources: labels.sources.length,
    observed: stage === "captured" ? available.size : observations.get(stage)?.candidateIds.length ?? null,
    omissions: observations.get(stage)?.omissions ?? (stage === "captured" ? labels.sources.filter(source => !available.has(source.candidateId))
      .map(source => ({ candidateId: source.candidateId, reason: source.exclusionReason ?? "not-captured" })) : []) }));
  boundaries.push({ stage: "delivered", expectedSources: labels.sources.length, observed: valid.size,
    omissions: labels.sources.filter(source => !valid.has(source.candidateId)).map(source => ({ candidateId: source.candidateId, reason: source.exclusionReason ?? "not-delivered" })) });
  const judgments: ContextQualityScore["judgments"] = observation?.judgments ? { positive: 0, uncertain: 0, negative: 0, invalid: 0, unavailable: 0, omitted: 0 } : null;
  if (judgments) for (const judgment of observation!.judgments!) judgments[judgment.value]++;
  const descriptors = labels.sources.map(source => source.description);
  return { suiteVersion: labels.suiteVersion, inputDigest: labels.inputDigest, labelDigest: labels.labelDigest, labelSource: labels.labelSource,
    essentialGroups: { expected: labels.essentialGroups.length, fileDelivered: labels.essentialGroups.filter(group => group.unitIds.some(id => valid.has(units.get(id)!.candidateId))).length,
      completeDelivered: complete.length, missed: labels.essentialGroups.filter(group => !complete.includes(group)).map(group => group.id),
      recall: labels.essentialGroups.length ? complete.length / labels.essentialGroups.length : null },
    conditionalAvailablePermitted: { expected: eligible.length, completeDelivered: eligible.filter(group => complete.includes(group)).length,
      recall: eligible.length ? eligible.filter(group => complete.includes(group)).length / eligible.length : null },
    requiredMissing, invalidSources, permissionExclusions: labels.sources.filter(source => source.bodyPermission === "excluded").map(source => ({ candidateId: source.candidateId, reason: source.exclusionReason! })),
    precision: { usefulSelected: usefulKeys.size, selected: selectedKeys.size, unknown, unlabelled,
      rate: labels.fullyLabeled && !unknown && !unlabelled && selectedKeys.size ? usefulKeys.size / selectedKeys.size : null },
    noMatch: { expected: labels.noMatch, correct: labels.noMatch ? optionalSelected === 0 : null, optionalSelected },
    descriptors: { present: descriptors.filter(item => item?.text !== null && item?.text !== undefined).length,
      accurate: descriptors.filter(item => item?.quality === "accurate").length, weak: descriptors.filter(item => item?.quality === "weak").length,
      unknown: descriptors.filter(item => !item || item.quality === "unknown").length }, boundaries, judgments };
}
