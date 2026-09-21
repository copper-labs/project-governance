import { structuredDocument } from "../structured-document.ts";
import { safeSubjectPath, type ValidationSubject } from "../change-subject.ts";
import type { Finding } from "../checker-results.ts";
const GRAPH = "config/validation/kmp-surfaces.yaml";
const STRUCTURE = "kmp-surface.structure-invalid", REFERENCE = "kmp-surface.reference-invalid";
const IMPLEMENTATION = "kmp-surface.implementation-gap", PROOF = "kmp-surface.proof-gap";
type Coordinates = { area_id?: string; target_id?: string; path?: string };
type Mapping = Record<string, unknown>;
type Component = { checkpoints: Array<[string, string]>; proofs: Array<[string, string[]]> };
const mapping = (value: unknown): value is Mapping => value !== null && typeof value === "object" && !Array.isArray(value);
const duplicate = (values: string[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();
const ordered = (values: unknown[], key: string) => [...values].sort((a, b) => {
  const left = mapping(a) ? String(a[key] ?? "") : "", right = mapping(b) ? String(b[key] ?? "") : "";
  return left < right ? -1 : left > right ? 1 : JSON.stringify(a).localeCompare(JSON.stringify(b));
});
class LimitReached extends Error {}

/** Structural references describe declared coverage, never successful execution or device qualification. */
class Validator {
  findings: Finding[] = []; truncated = false;
  readonly subject: ValidationSubject; readonly includeGaps: boolean;
  constructor(subject: ValidationSubject, includeGaps: boolean) { this.subject = subject; this.includeGaps = includeGaps; }
  add(rule_id: string, message: string, coordinates: Coordinates = {}) {
    if (this.findings.length >= 500) { this.truncated = true; throw new LimitReached(); }
    this.findings.push({ severity: "blocking", rule_id, message, ...coordinates });
  }
  structure(message: string, coordinates: Coordinates = {}) { this.add(STRUCTURE, message, coordinates); }
  map(value: unknown, label: string, allowed: string[], required: string[] = [], coordinates: Coordinates = {}): Mapping | null {
    if (!mapping(value)) { this.structure(`${label} must be a mapping`, coordinates); return null; }
    for (const key of Object.keys(value).filter(key => !allowed.includes(key)).sort()) this.structure(`${label} has unknown field ${key}`, coordinates);
    for (const key of required.filter(key => !Object.hasOwn(value, key)).sort()) this.structure(`${label}.${key} is required`, coordinates);
    return value;
  }
  text(value: unknown, label: string, coordinates: Coordinates = {}, stable = false): string | null {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) { this.structure(`${label} must be a non-empty string without surrounding whitespace`, coordinates); return null; }
    if (stable && !/^[a-z0-9][a-z0-9._-]*$/u.test(value)) { this.structure(`${label} must be a stable lowercase ID`, coordinates); return null; }
    return value;
  }
  strings(value: unknown, label: string, coordinates: Coordinates = {}, stable = false): string[] {
    if (!Array.isArray(value) || !value.length) { this.structure(`${label} must be a non-empty list`, coordinates); return []; }
    const values = value.map((item, i) => this.text(item, `${label}[${i}]`, coordinates, stable)).filter((item): item is string => item !== null);
    for (const item of duplicate(values)) this.structure(`${label} contains duplicate value ${item}`, coordinates);
    return [...new Set(values)];
  }
  reference(value: unknown, label: string, coordinates: Coordinates = {}): string | null {
    if (typeof value !== "string") { this.structure(`${label} must be a path string`, coordinates); return null; }
    try {
      safeSubjectPath(value);
      const source = this.subject.source(value);
      if (!source || source.file_type !== "regular") { this.add(REFERENCE, `${label} is ${source ? "not a regular file (symlink)" : "missing"}`, { ...coordinates, path: value }); return null; }
      return value;
    } catch { this.add(REFERENCE, `${label}: invalid or unavailable subject path`, { ...coordinates, path: value }); return null; }
  }
  document(path: string, json = false): unknown {
    return structuredDocument(this.subject.read(path, 256 * 1024), json ? "json" : "yaml");
  }

  component(value: unknown, label: string, coordinates: Coordinates): Component {
    const item = this.map(value, label, ["checkpoints", "proofs"], [], coordinates), result: Component = { checkpoints: [], proofs: [] };
    if (!item) return result;
    for (const field of ["checkpoints", "proofs"] as const) {
      const raw = Object.hasOwn(item, field) ? item[field] : [];
      if (!Array.isArray(raw)) { this.structure(`${label}.${field} must be a list`, coordinates); continue; }
      for (const [index, rawEntry] of raw.entries()) {
        const name = `${label}.${field}[${index}]`, fields = field === "checkpoints" ? ["role", "path"] : ["path", "claims"];
        const entry = this.map(rawEntry, name, fields, fields, coordinates); if (!entry) continue;
        if (field === "checkpoints") {
          const role = this.text(entry.role, `${name}.role`, coordinates), path = this.reference(entry.path, `${name}.path`, coordinates);
          if (role !== null && path !== null) result.checkpoints.push([role, path]);
        } else {
          const path = this.reference(entry.path, `${name}.path`, coordinates), claims = this.strings(entry.claims, `${name}.claims`, coordinates);
          if (path !== null && claims.length) result.proofs.push([path, claims]);
        }
      }
    }
    for (const encoded of duplicate(result.checkpoints.map(value => JSON.stringify(value)))) {
      const [role, path] = JSON.parse(encoded) as [string, string]; this.structure(`${label} contains duplicate checkpoint ${role} at ${path}`, { ...coordinates, path });
    }
    for (const path of duplicate(result.proofs.map(([path]) => path))) this.structure(`${label} contains duplicate proof path ${path}`, { ...coordinates, path });
    return result;
  }
  area(value: unknown, index: number, targets: string[]) {
    const requirements = ["required_checkpoint_roles", "required_proof_claims", "required_target_proof_claims"];
    const item = this.map(value, `areas[${index}]`, ["id", "summary", "validation", "contract", ...requirements, "shared_route", "projections", "target_routes"], ["id", "summary", "validation", "contract", "shared_route"]);
    if (!item) return;
    const area_id = this.text(item.id, `areas[${index}].id`, {}, true) ?? `areas[${index}]`, coordinates = { area_id };
    this.text(item.summary, `area ${area_id}.summary`, coordinates);
    let validation = item.validation;
    if (validation !== "route" && validation !== "guarded") { this.structure(`area ${area_id}.validation must be route or guarded`, coordinates); validation = "route"; }
    const contract = this.map(item.contract, `area ${area_id}.contract`, ["path"], ["path"], coordinates);
    if (contract) this.reference(contract.path, "contract.path", coordinates);
    const shared = this.component(item.shared_route, "shared_route", coordinates);
    if (!shared.checkpoints.length) this.structure("shared_route requires a checkpoint", coordinates);
    let roles: string[] = [], proofs: string[] = [], targetProofs: string[] = [];
    if (validation === "route") {
      for (const field of requirements.filter(field => Object.hasOwn(item, field)).sort()) this.structure(`route area cannot contain ${field}`, coordinates);
    } else {
      [roles, proofs, targetProofs] = requirements.map(field => this.strings(item[field], field, coordinates)) as [string[], string[], string[]];
      if (targetProofs.some(claim => !proofs.includes(claim))) this.structure("required_target_proof_claims must be a subset of required_proof_claims", coordinates);
      if (!shared.proofs.length) this.structure("guarded shared_route requires a proof", coordinates);
    }
    const componentsOnly = (entry: Mapping) => Object.fromEntries(["checkpoints", "proofs"].filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]));
    const projections: Array<Component & { id: string | null; targets: string[] }> = [];
    const rawProjections = Object.hasOwn(item, "projections") ? item.projections : [];
    if (!Array.isArray(rawProjections)) this.structure("projections must be a list", coordinates);
    else for (const [i, raw] of ordered(rawProjections, "id").entries()) {
      const label = `area ${area_id}.projections[${i}]`, projection = this.map(raw, label, ["id", "targets", "checkpoints", "proofs"], ["id", "targets"], coordinates); if (!projection) continue;
      const id = this.text(projection.id, `${label}.id`, coordinates, true), selected = this.strings(projection.targets, `${label}.targets`, coordinates, true);
      for (const target_id of selected.filter(target => !targets.includes(target)).sort()) this.structure(`projection target ${target_id} is absent from the target catalog`, { ...coordinates, target_id });
      const component = this.component(componentsOnly(projection), label, coordinates);
      if (!component.checkpoints.length && !component.proofs.length) this.structure(`${label} must contain a checkpoint or proof`, coordinates);
      projections.push({ id, targets: selected, ...component });
    }
    for (const id of duplicate(projections.flatMap(value => value.id ? [value.id] : []))) this.structure(`duplicate projection id ${id}`, coordinates);
    const routes: Array<Component & { target: string | null; gap: unknown }> = [];
    const rawRoutes = Object.hasOwn(item, "target_routes") ? item.target_routes : [];
    if (!Array.isArray(rawRoutes)) this.structure("target_routes must be a list", coordinates);
    else for (const [i, raw] of ordered(rawRoutes, "target").entries()) {
      const label = `area ${area_id}.target_routes[${i}]`, route = this.map(raw, label, ["target", "gap_kind", "reason", "owner", "checkpoints", "proofs"], ["target"], coordinates); if (!route) continue;
      const target = this.text(route.target, `${label}.target`, coordinates, true), location = { ...coordinates, ...(target ? { target_id: target } : {}) };
      let gap = route.gap_kind ?? null;
      if (gap !== null && gap !== "implementation" && gap !== "proof") { this.structure(`${label}.gap_kind must be implementation or proof`, location); gap = null; }
      if (gap !== null) { this.text(route.reason, `${label}.reason`, location); if (Object.hasOwn(route, "owner")) this.text(route.owner, `${label}.owner`, location); }
      else if (Object.hasOwn(route, "reason") || Object.hasOwn(route, "owner")) this.structure(`${label}.reason and owner require gap_kind`, location);
      routes.push({ target, gap, ...this.component(componentsOnly(route), label, location) });
    }
    for (const target_id of duplicate(routes.flatMap(value => value.target ? [value.target] : []))) this.structure(`duplicate target route ${target_id}`, { ...coordinates, target_id });
    for (const target_id of [...new Set(routes.flatMap(value => value.target && !targets.includes(value.target) ? [value.target] : []))].sort()) this.structure(`target route ${target_id} is absent from the target catalog`, { ...coordinates, target_id });
    if (validation === "route" && [shared, ...projections, ...routes].some(value => value.proofs.length)) this.structure("route area cannot contain proofs", coordinates);
    const selectedTargets = this.includeGaps ? targets : [...new Set(routes.flatMap(route => route.target && targets.includes(route.target) ? [route.target] : []))];
    for (const target of [...selectedTargets].sort()) {
      const location = { ...coordinates, target_id: target }, route = routes.filter(value => value.target === target).at(-1);
      if (!route) { if (this.includeGaps) this.add(IMPLEMENTATION, "catalog target has no route for this area", location); continue; }
      const composition = [shared, ...projections.filter(value => value.targets.includes(target)), route];
      const composedRoles = new Set(composition.flatMap(value => value.checkpoints.map(([role]) => role)));
      const composedClaims = new Set(composition.flatMap(value => value.proofs.flatMap(([, claims]) => claims)));
      const localClaims = new Set(route.proofs.flatMap(([, claims]) => claims));
      const missingRoles = roles.filter(role => !composedRoles.has(role)).sort();
      if (route.gap === "implementation") { if (this.includeGaps) this.add(IMPLEMENTATION, "target route declares an implementation gap", location); continue; }
      if (route.gap === "proof") {
        if (validation === "route") this.structure("proof gap is invalid on a route area", location);
        if (!route.checkpoints.length || missingRoles.length) this.structure("proof gap requires a complete implementation route", location);
        if (this.includeGaps && validation === "guarded") this.add(PROOF, "target route declares a proof gap", location);
        continue;
      }
      if (this.includeGaps && (!route.checkpoints.length || missingRoles.length)) this.add(IMPLEMENTATION, `target implementation is missing ${missingRoles.join(", ") || "target-local checkpoint"}`, location);
      const missing = [...new Set([...proofs.filter(claim => !composedClaims.has(claim)), ...targetProofs.filter(claim => !localClaims.has(claim))])].sort();
      if (this.includeGaps && validation === "guarded" && (!route.proofs.length || missing.length)) this.add(PROOF, `target proof is incomplete${missing.length ? `: ${missing.join(", ")}` : ""}`, location);
    }
  }
  validate() {
    let value: unknown;
    if (!this.reference(GRAPH, "graph")) return;
    try { value = this.document(GRAPH); } catch { this.structure("Graph document is invalid or exceeds its bounds", { path: GRAPH }); return; }
    const graph = this.map(value, "graph", ["kind", "schema_version", "target_catalog", "areas"], ["kind", "schema_version", "target_catalog", "areas"]); if (!graph) return;
    if (graph.kind !== "kmp-surface-validation") this.structure("graph.kind must be kmp-surface-validation", { path: GRAPH });
    if (graph.schema_version !== 1) this.structure("graph.schema_version must be exactly 1", { path: GRAPH });
    const path = this.reference(graph.target_catalog, "target_catalog"); if (!path) return;
    try { value = this.document(path, true); } catch { this.structure("Target catalog is invalid or exceeds its bounds", { path }); return; }
    const catalog = this.map(value, "target catalog", ["kind", "schema_version", "targets"], ["kind", "schema_version", "targets"]); if (!catalog) return;
    if (catalog.kind !== "kmp-surface-target-catalog") this.structure("target catalog kind must be kmp-surface-target-catalog", { path });
    if (catalog.schema_version !== 1) this.structure("target catalog schema_version must be exactly 1", { path });
    const targets = this.strings(catalog.targets, "target catalog targets", {}, true);
    if (!Array.isArray(graph.areas) || !graph.areas.length) { this.structure("graph.areas must be a non-empty list", { path: GRAPH }); return; }
    for (const [index, area] of ordered(graph.areas, "id").entries()) this.area(area, index, targets);
    for (const id of duplicate(graph.areas.flatMap(area => mapping(area) && typeof area.id === "string" ? [area.id] : []))) this.structure(`duplicate area id ${id}`, { area_id: id });
  }
}
export function checkKmpSurface(subject: ValidationSubject, includeGaps = true) {
  const validator = new Validator(subject, includeGaps);
  try { validator.validate(); } catch (error) { if (!(error instanceof LimitReached)) throw error; }
  const keys = ["rule_id", "area_id", "target_id", "path", "message"];
  const findings = validator.findings.sort((a, b) => {
    for (const key of keys) { const left = String(a[key] ?? ""), right = String(b[key] ?? ""); if (left !== right) return left < right ? -1 : 1; }
    return 0;
  });
  if (validator.truncated) { findings.splice(499); findings.push({ severity: "blocking", rule_id: STRUCTURE, message: "finding limit 500 exceeded; remaining findings omitted" }); }
  return { status: findings.length ? "failed" : "passed", findings };
}
