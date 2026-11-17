import { readSourceRangeAuthority } from "./dependency-source-ranges.ts";
import { readSignedLockTargets } from "./dependency-signed-lock.ts";
import { readNpmRangeTargets } from "./dependency-range-selections.ts";
import type { Finding } from "../checker-results.ts";
import { dependencyFieldErrors } from "./dependency-evidence.ts";
import { registryPolicyErrors, type NpmRegistries } from "./dependency-registry.ts";

/** Invalid policy reports blocking findings while retaining conservative evaluation limits. */
export function validateDependencyPolicy(document: Record<string, unknown>, path: string, evidencePath: string) {
  const findings: Finding[] = [];
  const add = (message: string) => findings.push({ rule_id: "dependency.policy-invalid", path, severity: "blocking", message });
  const required = ["version", "owner", "minimum_age_days", "fail_closed_when_unknown", "evidence_path", "override_max_days"];
  for (const error of dependencyFieldErrors(document, [...required, "npm_registries", "npm_range_selections_sha256", "npm_range_targets", "npm_signed_lock_targets", "npm_source_ranges"], required, "policy")) add(error);
  if (document["version"] !== 1) add("version must be 1");
  if (typeof document["owner"] !== "string" || !document["owner"].trim()) add("owner must be a non-empty string");
  const registryErrors = registryPolicyErrors(document["npm_registries"] ?? {});
  registryErrors.forEach(add);
  const rangeSelectionsDigest = document["npm_range_selections_sha256"];
  if (rangeSelectionsDigest !== undefined && (typeof rangeSelectionsDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(rangeSelectionsDigest)))
    add("npm_range_selections_sha256 must pin exact receipt bytes with SHA-256");
  const rawTargets = document["npm_range_targets"];
  let rangeTargets: ReturnType<typeof readNpmRangeTargets> | null = null;
  if (rangeSelectionsDigest !== undefined || rawTargets !== undefined) {
    try {
      if (rangeSelectionsDigest === undefined) throw new Error("Missing selection digest");
      rangeTargets = readNpmRangeTargets(rawTargets);
    } catch { add("npm_range_targets and npm_range_selections_sha256 must bind the full expected target set"); }
  }
  let signedLockTargets: ReturnType<typeof readSignedLockTargets> | null = null;
  if (Object.hasOwn(document, "npm_signed_lock_targets")) {
    try {
      if (!rangeTargets) throw new Error("Missing signed selection authority");
      signedLockTargets = readSignedLockTargets(document["npm_signed_lock_targets"], rangeTargets);
    } catch { add("npm_signed_lock_targets must bind approved signed selections and exact artifacts"); }
  }
  let sourceRanges: ReturnType<typeof readSourceRangeAuthority> | null = null;
  if (Object.hasOwn(document, "npm_source_ranges")) {
    try { sourceRanges = readSourceRangeAuthority(document["npm_source_ranges"]); }
    catch { add("npm_source_ranges must bind a reviewed source producer projection and expected targets"); }
  }
  const age = document["minimum_age_days"], maximum = document["override_max_days"];
  const minimumAgeDays = typeof age === "number" && Number.isSafeInteger(age) && age >= 14 ? age : 14;
  if (minimumAgeDays !== age) add("minimum_age_days must be an integer of at least 14");
  const maximumOverrideDays = typeof maximum === "number" && Number.isSafeInteger(maximum) && maximum > 0 ? maximum : 1;
  if (maximumOverrideDays !== maximum) add("override_max_days must be a positive integer");
  if (document["fail_closed_when_unknown"] !== true) add("fail_closed_when_unknown must be true");
  if (document["evidence_path"] !== evidencePath) add("evidence_path must match the checker evidence path exactly");
  const registries = registryErrors.length ? {} : structuredClone((document["npm_registries"] ?? {}) as NpmRegistries);
  return { minimumAgeDays, maximumOverrideDays, registries, findings, rangeTargets, signedLockTargets, sourceRanges,
    rangeSelectionsDigest: typeof rangeSelectionsDigest === "string" && !findings.length ? rangeSelectionsDigest : null };
}
