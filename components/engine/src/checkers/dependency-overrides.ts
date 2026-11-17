import type { NpmRegistries } from "./dependency-registry.ts";
import { coordinateFields, dependencyFieldErrors, indexDependencyRecords } from "./dependency-evidence.ts";
import { dependencyMoment, dayMicroseconds } from "./dependency-time.ts";
import { authoritativeDependencySource } from "./dependency-sources.ts";
const fields = [...coordinateFields, "published_at", "source_url", "reason", "risk_owner", "approved_by", "approver_role", "approved_at", "expires_at", "follow_up", "evidence"];
const utcDay = (moment: bigint) => moment >= 0n ? moment / dayMicroseconds : (moment - dayMicroseconds + 1n) / dayMicroseconds;
/** An override is valid only for an exact release, named operator approval and bounded current time window. */
export function indexDependencyOverrides(document: Record<string, unknown>, maximumDays: number, asOf: bigint, relevant: Set<string>, registries: NpmRegistries = {}) {
  if (!Number.isSafeInteger(maximumDays) || maximumDays <= 0) throw new Error("Invalid override maximum duration");
  return indexDependencyRecords(document, "overrides", "overrides", relevant, registries, (record, coordinate, label) => {
    const problems = dependencyFieldErrors(record, fields, fields, label);
    try {
      const approved = dependencyMoment(record["approved_at"], `${label}.approved_at`), expires = dependencyMoment(record["expires_at"], `${label}.expires_at`, true);
      const published = dependencyMoment(record["published_at"], `${label}.published_at`);
      if (expires <= approved) problems.push(`${label}: expires_at must be after approved_at`);
      else if (approved > asOf) problems.push(`${label}: approved_at cannot be later than the checker evaluation time`);
      else if (utcDay(expires) - utcDay(approved) > BigInt(maximumDays)) problems.push(`${label}: override exceeds policy maximum of ${maximumDays} days`);
      else if (expires < asOf) problems.push(`${label}: override has expired`);
      if (published > approved) problems.push(`${label}.published_at: cannot be later than approved_at`);
    } catch (error) { problems.push(error instanceof Error ? error.message : `${label}: invalid override time`); }
    if (!authoritativeDependencySource(coordinate, record["source_url"], registries)) problems.push(`${label}.source_url: expected an authoritative HTTPS URL bound to the exact dependency coordinate`);
    for (const field of ["reason", "risk_owner", "approved_by", "follow_up", "evidence"]) if (typeof record[field] !== "string" || !record[field].trim()) problems.push(`${label}.${field}: must be a non-empty string`);
    if (record["approver_role"] !== "operator") problems.push(`${label}.approver_role: must be operator`);
    return problems;
  });
}
