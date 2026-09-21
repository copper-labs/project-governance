import type { Finding } from "../checker-results.ts";
import { dependencyFieldErrors } from "./dependency-evidence.ts";
import { registryPolicyErrors } from "./dependency-registry.ts";

/** Invalid policy reports blocking findings while retaining conservative evaluation limits. */
export function validateDependencyPolicy(document: Record<string, unknown>, path: string, evidencePath: string) {
  const findings: Finding[] = [];
  const add = (message: string) => findings.push({ rule_id: "dependency.policy-invalid", path, severity: "blocking", message });
  const required = ["version", "owner", "minimum_age_days", "fail_closed_when_unknown", "evidence_path", "override_max_days"];
  for (const error of dependencyFieldErrors(document, [...required, "npm_registries"], required, "policy")) add(error);
  if (document["version"] !== 1) add("version must be 1");
  if (typeof document["owner"] !== "string" || !document["owner"].trim()) add("owner must be a non-empty string");
  const registryErrors = registryPolicyErrors(document["npm_registries"] ?? {});
  registryErrors.forEach(add);
  const age = document["minimum_age_days"], maximum = document["override_max_days"];
  const minimumAgeDays = typeof age === "number" && Number.isSafeInteger(age) && age >= 14 ? age : 14;
  if (minimumAgeDays !== age) add("minimum_age_days must be an integer of at least 14");
  const maximumOverrideDays = typeof maximum === "number" && Number.isSafeInteger(maximum) && maximum > 0 ? maximum : 1;
  if (maximumOverrideDays !== maximum) add("override_max_days must be a positive integer");
  if (document["fail_closed_when_unknown"] !== true) add("fail_closed_when_unknown must be true");
  if (document["evidence_path"] !== evidencePath) add("evidence_path must match the checker evidence path exactly");
  const registries = registryErrors.length ? {} : structuredClone((document["npm_registries"] ?? {}) as Record<string, string>);
  return { minimumAgeDays, maximumOverrideDays, registries, findings };
}
