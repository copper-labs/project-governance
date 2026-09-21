import { structuredDocument } from "../structured-document.ts";
import type { ValidationSubject } from "../change-subject.ts";
import type { Packs } from "../pack-configuration.ts";
import { matchesPackPath } from "../planning.ts";
import { checkKmpSurface } from "./kmp-surface.ts";
const ID = "kmp-surface-validation", GRAPH = "config/validation/kmp-surfaces.yaml";
const mapping = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Diagnose only enabled graph wiring. Missing target implementations belong to the validator, not doctor. */
export function kmpDoctorFindings(subject: ValidationSubject, packs: Packs): string[] {
  const invocations = Object.entries(packs).sort(([a], [b]) => a.localeCompare(b)).flatMap(([id, pack]) =>
    (pack.implementation_status ?? "active") === "active"
      ? pack.commands.filter(command => mapping(command) && command.builtin === ID).map(() => id) : []);
  if (!invocations.length) return [];
  const findings: string[] = [];
  if (invocations.length !== 1 || invocations[0] !== ID) findings.push(`kmp surface validation must have exactly one active invocation in pack ${ID}; found ${invocations.join(", ")}`);
  if (!invocations.includes(ID)) return findings;
  for (const finding of checkKmpSurface(subject, false).findings) {
    if (!["kmp-surface.structure-invalid", "kmp-surface.reference-invalid"].includes(finding.rule_id)) continue;
    const coordinates = [finding.area_id, finding.target_id, finding.path].filter(Boolean).join(", ");
    findings.push(`${finding.rule_id}${coordinates ? ` (${coordinates})` : ""}: ${finding.message}`);
  }
  let catalog: string | null = null;
  try {
    const value: unknown = structuredDocument(subject.read(GRAPH, 256 * 1024), "yaml");
    if (mapping(value) && typeof value.target_catalog === "string") catalog = value.target_catalog;
  } catch { /* Structural diagnostics above own malformed authority inputs. */ }
  for (const path of [GRAPH, catalog]) if (path && !matchesPackPath(path, packs[ID]!.path_globs)) findings.push(`pack ${ID} path_globs do not select ${path}`);
  let routed = false;
  try {
    const profile: unknown = structuredDocument(subject.read("config/governance/profile.yaml", 256 * 1024), "yaml");
    if (mapping(profile) && mapping(profile.context_router) && Array.isArray(profile.context_router.routes)) {
      routed = profile.context_router.routes.some(route => mapping(route) && Array.isArray(route.skills) && route.skills.includes("kmp-implementation"));
    }
  } catch { /* Missing or invalid profile cannot establish route-local enablement. */ }
  if (!routed) findings.push("an adopter context route must select kmp-implementation in route.skills");
  return findings;
}
