import { parse } from "yaml";
import { posix } from "node:path";
import { ValidationSubject, safeSubjectPath } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { objectValue } from "./dependency-manifests.ts";
import { profileDecisionConfig } from "../decision-configuration.ts";

export const CONTEXT_BUDGET = { primary_context_tokens: 6000, active_plan_context_tokens: 1500, expansion_context_tokens: 3000, total_context_tokens: 10000 };
export const MAX_CONTEXT_TOKENS = (256 * 1024 - 16000) / 4;
const fields = new Set(["ecosystems", "target_families", "runtime_profiles", "support_tiers", "artifact_profiles", "consumers", "ui_posture", "device_topology", "boundary_pressure"]);
/** Shared limits prevent validation and packet construction from accepting different budgets. */
export function contextBudget(value: unknown): typeof CONTEXT_BUDGET {
  if (value !== undefined && !objectValue(value)) throw new Error("token_budget must be a mapping");
  const configured = objectValue(value) ? value : {}, result = { ...CONTEXT_BUDGET };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const amount = Object.hasOwn(configured, key) ? configured[key] : result[key];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) throw new Error(`token_budget.${key} must be a positive integer`);
    result[key] = amount;
  }
  if (result.total_context_tokens > MAX_CONTEXT_TOKENS) throw new Error("token_budget exceeds the runtime packet ceiling");
  for (const key of Object.keys(result) as (keyof typeof result)[]) if (result[key] > result.total_context_tokens) throw new Error(`token_budget.${key} exceeds total_context_tokens`);
  return result;
}
/** Check captured target configuration without generating context or calling a model. */
export function checkContextRouter(subject: ValidationSubject, packIds: ReadonlySet<string>) {
  const errors: string[] = [];
  const load = (path: string, required: boolean): Record<string, unknown> => {
    try {
      if (!subject.source(path)) { if (required) errors.push(`${path}: required ordinary YAML file is missing`); return {}; }
      const value: unknown = parse(new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path, 4 * 1024 * 1024))) ?? {};
      if (!objectValue(value)) throw new Error();
      return value;
    } catch { errors.push(`${path}: invalid or unreadable YAML mapping`); return {}; }
  };
  const profile = load("config/governance/profile.yaml", false), configured = Object.hasOwn(profile, "context_router");
  try { profileDecisionConfig(profile); }
  catch { errors.push("config/governance/profile.yaml: invalid continuity.decisions configuration"); }
  const factsDocument = load("config/governance/facts.lock.yaml", configured);
  const list = (value: unknown, label: string, visit: (item: unknown, label: string) => void) => {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) { errors.push(`${label}: expected a list`); return; }
    value.forEach((item, index) => visit(item, `${label}[${index}]`));
  };
  const skills = (value: unknown, label: string) => list(value, label, (item, owner) => {
    if (typeof item !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(item)) errors.push(`${owner}: unsafe skill id`);
  });
  const paths = (value: unknown, label: string) => list(value, label, (item, owner) => {
    try {
      if (typeof item !== "string" || !item.trim() || item.trim().split("/").includes("..")) throw new Error();
      const path = posix.normalize(item.trim()); safeSubjectPath(path);
      if (subject.source(path)?.file_type !== "regular") throw new Error();
    } catch { errors.push(`${owner}: expected an ordinary repository-relative captured file`); }
  });
  if (!errors.length) {
    const facts = factsDocument["facts"];
    if (facts !== undefined && facts !== null && !objectValue(facts)) errors.push("facts.lock.yaml facts: expected a mapping");
    const context = objectValue(facts) ? facts["skill_context"] : undefined;
    if (context !== undefined && context !== null) {
      if (!objectValue(context)) errors.push("facts.skill_context: expected a mapping");
      else for (const [key, values] of Object.entries(context)) {
        if (!fields.has(key)) { errors.push(`facts.skill_context.${key}: unsupported field`); continue; }
        const seen = new Set<string>();
        if (!Array.isArray(values)) { errors.push(`facts.skill_context.${key}: expected a list`); continue; }
        list(values, `facts.skill_context.${key}`, (item, label) => {
          if (typeof item !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(item)) errors.push(`${label}: expected a lowercase fact token without whitespace`);
          else if (seen.has(item)) errors.push(`${label}: duplicate value`);
          if (typeof item === "string") seen.add(item);
        });
      }
    }
  }
  if (configured && !errors.length) {
    const router = profile["context_router"];
    if (!objectValue(router)) errors.push("context_router: expected a mapping");
    else {
      if (profile["profile_id"] && factsDocument["profile_id"] && profile["profile_id"] !== factsDocument["profile_id"]) errors.push("profile.yaml and facts.lock.yaml identify different repositories");
      paths(router["default_context"], "context_router.default_context"); skills(router["default_skills"], "context_router.default_skills");
      const routes = Object.hasOwn(router, "routes") ? router["routes"] : [], seen = new Set<string>();
      if (!Array.isArray(routes)) errors.push("context_router.routes: expected a list");
      else routes.forEach((route: unknown, index: number) => {
        const label = `context_router.routes[${index}]`;
        if (!objectValue(route) || typeof route["id"] !== "string" || !route["id"].trim()) { errors.push(`${label}: mapping with a nonempty id required`); return; }
        const id = route["id"].trim(); if (seen.has(id)) errors.push(`${label}: duplicate route id`); seen.add(id);
        for (const key of ["primary_context", "active_plan_context", "expansion_context"]) paths(route[key], `${label}.${key}`);
        skills(route["skills"], `${label}.skills`);
        try { contextBudget(route["token_budget"]); } catch (error) { errors.push(`${label}: ${(error as Error).message}`); }
        list(route["validations"], `${label}.validations`, (item, owner) => { if (typeof item !== "string" || !packIds.has(item)) errors.push(`${owner}: unknown validation pack`); });
      });
    }
  }
  const findings: Finding[] = errors.map(message => ({ rule_id: "context-router.configuration", severity: "blocking", message }));
  return { version: 1, kind: "governance-check-result", ...findingSummary(findings), findings };
}
