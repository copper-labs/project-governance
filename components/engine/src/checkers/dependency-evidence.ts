import { npmUrlRegistry, type NpmRegistries } from "./dependency-registry.ts";
import { dependency, objectValue, type DependencyCoordinate } from "./dependency-manifests.ts";
import { dependencyMoment, dayMicroseconds } from "./dependency-time.ts";
import { authoritativeDependencySource } from "./dependency-sources.ts";
export const coordinateFields = ["ecosystem", "name", "version", "artifact_type"] as const;
export const coordinateKey = (value: DependencyCoordinate) => JSON.stringify(coordinateFields.map(field => value[field]));
export const registryCoordinateKey = (value: DependencyCoordinate, registry: string) =>
  JSON.stringify([...coordinateFields.map(field => value[field]), registry]);
export function recordCoordinate(value: unknown): DependencyCoordinate | null {
  if (!objectValue(value) || coordinateFields.some(field => typeof value[field] !== "string" || !value[field].trim())) return null;
  return dependency(value["name"] as string, value["ecosystem"] as string, value["version"] as string, value["artifact_type"] as string);
}
export function dependencyFieldErrors(record: Record<string, unknown>, allowed: string[], required: string[], label: string): string[] {
  const unknown = Object.keys(record).filter(field => !allowed.includes(field)).sort(), missing = required.filter(field => !Object.hasOwn(record, field)).sort();
  return [...(unknown.length ? [`${label}: unknown fields: ${unknown.join(", ")}`] : []), ...(missing.length ? [`${label}: missing fields: ${missing.join(", ")}`] : [])];
}
export function dependencyRegistryErrors(document: Record<string, unknown>, key: string, label: string): string[] {
  if (document["version"] === 1) return [`${label}: legacy schema version 1 is incompatible with coordinate registry version 2; migrate this registry before checking`];
  const fields = ["version", "owner", key], errors = dependencyFieldErrors(document, fields, fields, label);
  if (document["version"] !== 2) errors.push(`${label}: version must be 2`);
  if (typeof document["owner"] !== "string" || !document["owner"].trim()) errors.push(`${label}: owner must be a non-empty string`);
  if (!Array.isArray(document[key])) errors.push(`${label}: ${key} must be a list`);
  return errors.length ? [`${label}: invalid registry envelope: ${errors.join("; ")}`] : [];
}
/** Scope npm evidence by the exact metadata route while retaining ordinary coordinate lookups. */
export function indexDependencyRecords(document: Record<string, unknown>, arrayKey: "records" | "overrides",
  label: string, relevant: Set<string>, registries: NpmRegistries,
  validate: (record: Record<string, unknown>, coordinate: DependencyCoordinate, label: string) => string[]) {
  const indexed = new Map<string, Record<string, unknown>>(), matched = new Set<string>();
  const errors = dependencyRegistryErrors(document, arrayKey, label);
  if (errors.length) return { indexed, matched: new Set(relevant), errors };
  const seen = new Set<string>(), candidates = new Map<string, Record<string, unknown>>();
  const aliases = new Map<string, Set<string>>();
  for (const [index, raw] of (document[arrayKey] as unknown[]).entries()) {
    const coordinate = recordCoordinate(raw);
    if (!coordinate || !objectValue(raw)) continue;
    const key = coordinateKey(coordinate);
    const registry = coordinate.ecosystem === "npm"
      ? npmUrlRegistry(coordinate.name, `/${coordinate.version}`, raw["source_url"], registries, true) : undefined;
    const identity = registry ? registryCoordinateKey(coordinate, registry) : key;
    const requested = [...new Set([key, identity])].filter(id => relevant.has(id));
    if (!requested.length) continue;
    for (const id of requested) {
      matched.add(id);
      const sources = aliases.get(id) ?? new Set();
      sources.add(identity);
      aliases.set(id, sources);
    }
    const sourceLabel = `${label}.${arrayKey}[${index + 1}]`, problems = validate(raw, coordinate, sourceLabel);
    if (seen.has(identity)) {
      problems.push(`${sourceLabel}: duplicate dependency coordinate at this source`);
      candidates.delete(identity);
    }
    seen.add(identity);
    errors.push(...problems);
    if (!problems.length) candidates.set(identity, raw);
  }
  for (const [key, sources] of aliases) {
    const record = [...sources].map(source => candidates.get(source)).find(source => source !== undefined);
    if (record) indexed.set(key, structuredClone(record));
  }
  return { indexed, matched, errors };
}

const evidenceFields = [...coordinateFields, "evaluated_at", "published_at", "source_url"];
export function indexDependencyEvidence(document: Record<string, unknown>, minimumAgeDays: number, asOf: bigint,
  relevant: Set<string>, registries: NpmRegistries = {}) {
  if (!Number.isSafeInteger(minimumAgeDays) || minimumAgeDays < 0) throw new Error("Invalid minimum dependency age");
  return indexDependencyRecords(document, "records", "evidence", relevant, registries, (record, coordinate, label) => {
    const recordErrors = dependencyFieldErrors(record, evidenceFields, evidenceFields, label);
    try {
      const evaluated = dependencyMoment(record["evaluated_at"], `${label}.evaluated_at`), published = dependencyMoment(record["published_at"], `${label}.published_at`);
      if (evaluated > asOf) recordErrors.push(`${label}.evaluated_at: cannot be later than the checker evaluation time`);
      if (evaluated - published < BigInt(minimumAgeDays) * dayMicroseconds) recordErrors.push(`${label}: release was younger than ${minimumAgeDays} full days at evaluated_at`);
    } catch (error) { recordErrors.push(error instanceof Error ? error.message : `${label}: invalid evidence time`); }
    if (!authoritativeDependencySource(coordinate, record["source_url"], registries)) recordErrors.push(`${label}.source_url: expected an authoritative HTTPS URL bound to the exact dependency coordinate`);
    return recordErrors;
  });
}
