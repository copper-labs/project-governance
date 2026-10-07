import { decisionProviderAdapter, type DecisionProviderId } from "./decision-providers.ts";
import { parse } from "yaml";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, object } from "./core.ts";
import { DECISION_CONSUMERS } from "./decision-catalog.ts";
import { DECISION_CONSUMER_IDS, DECISION_EFFECTS, DECISION_MODES, type DecisionConsumerId, type DecisionEffect, type DecisionMode } from "./decision-schema.ts";
import { profileDecisionConfig, loadProfileDecisionConfig } from "./decision-configuration.ts";
import type { DecisionConfig } from "./decisions.ts";
import { modelRoutingSettings, type ModelRoutingSettings } from "./model-routing-settings.ts";

export interface ConsumerSetting { mode: DecisionMode; effect: DecisionEffect; effectSource: "declared" | "default" }
export interface DecisionBudgetLimits { maxCalls: number; maxRequestBytes: number }
export interface EvaluationSettings {
  enabled: boolean; provider: DecisionProviderId; model: string;
  allowedArtifactRoots: string[]; dailyBudget: DecisionBudgetLimits | null;
}
export interface DecisionSettings {
  /** The existing top-level mode is the global ceiling over every consumer. */
  mode: DecisionMode;
  provider: DecisionProviderId;
  evaluation: EvaluationSettings;
  legacy: DecisionConfig;
  consumers: Record<DecisionConsumerId, ConsumerSetting>;
  budget: DecisionBudgetLimits;
  /** Larger retrieval defaults apply only to isolated context scopes; explicit YAML limits still own both. */
  contextBudget: DecisionBudgetLimits;
  migration: { notes: string[] };
  /** Explicit opt-in to new questions is separate from legacy context-ranking permission. */
  questionIds: Record<DecisionConsumerId, string[]>;
  configDigest: string;
  modelRouting: ModelRoutingSettings;
  /** Path metadata plus bounded task purpose may be disclosed; no source bodies. */
  allowedMetadataPaths?: string[];
}

export const DEFAULT_DECISION_BUDGET: DecisionBudgetLimits = { maxCalls: 16, maxRequestBytes: 128 * 1024 };
export const DEFAULT_CONTEXT_BUDGET: DecisionBudgetLimits = { maxCalls: 512, maxRequestBytes: 10 * 1024 * 1024 };
/** One configuration ceiling also owns the allowance suggested by metadata preflight. */
export const MAX_DECISION_BUDGET: DecisionBudgetLimits = { maxCalls: 1024, maxRequestBytes: 16 * 1024 * 1024 };
const ORDER: Record<DecisionMode, number> = { off: 0, shadow: 1, auto: 2 };
const LEGACY_CONTEXT_QUESTION = "rank_optional_context";

function consumerSetting(raw: unknown, id: DecisionConsumerId): ConsumerSetting {
  const entry = object(raw, `continuity.decisions.consumers.${id}`);
  for (const key of Object.keys(entry)) if (!["mode", "effect", "questions"].includes(key)) throw new Error(`Unknown decision consumer key: ${id}.${key}`);
  const mode = entry["mode"] ?? "off";
  if (typeof mode !== "string" || !(DECISION_MODES as readonly string[]).includes(mode)) throw new Error(`Invalid decision mode for ${id}`);
  if (entry["effect"] === undefined) return { mode: mode as DecisionMode, effect: "advise", effectSource: "default" };
  const effect = entry["effect"];
  if (typeof effect !== "string" || !(DECISION_EFFECTS as readonly string[]).includes(effect)) throw new Error(`Invalid decision effect for ${id}`);
  if (!DECISION_CONSUMERS[id].supportedEffects.includes(effect as DecisionEffect)) throw new Error(`Consumer ${id} does not support the ${effect} effect`);
  return { mode: mode as DecisionMode, effect: effect as DecisionEffect, effectSource: "declared" };
}

function budgetLimits(raw: unknown, defaults = DEFAULT_DECISION_BUDGET): DecisionBudgetLimits {
  if (raw === undefined) return { ...defaults };
  const entry = object(raw, "continuity.decisions.budget");
  for (const key of Object.keys(entry)) if (!["max_calls", "max_request_bytes"].includes(key)) throw new Error(`Unknown decision budget key: ${key}`);
  const maxCalls = entry["max_calls"] ?? defaults.maxCalls;
  const maxRequestBytes = entry["max_request_bytes"] ?? defaults.maxRequestBytes;
  if (!Number.isSafeInteger(maxCalls) || (maxCalls as number) < 1 || (maxCalls as number) > MAX_DECISION_BUDGET.maxCalls ||
      !Number.isSafeInteger(maxRequestBytes) || (maxRequestBytes as number) < 1024 || (maxRequestBytes as number) > MAX_DECISION_BUDGET.maxRequestBytes) throw new Error("Invalid decision budget bounds");
  return { maxCalls: maxCalls as number, maxRequestBytes: maxRequestBytes as number };
}

/**
 * Resolve the old E3 profile and the first-RC consumer settings once into one canonical owner.
 * New consumers default off, an omitted effect resolves to advice and conflicting declarations fail.
 */
export function profileDecisionSettings(profile: unknown): DecisionSettings {
  const legacy = profileDecisionConfig(profile);
  const provider = legacy.provider ?? "jev";
  const root = object(profile, "profile");
  const settings = root["continuity"] === undefined ? {} : object(object(root["continuity"], "continuity")["decisions"] ?? {}, "continuity.decisions");
  const generic = settings["evaluation"] === undefined ? {} : object(settings["evaluation"], "continuity.decisions.evaluation");
  for (const key of Object.keys(generic)) if (!["enabled", "provider", "model", "allowed_artifact_roots", "daily_budget"].includes(key)) throw new Error("Unknown generic evaluation setting");
  if (generic.enabled !== undefined && typeof generic.enabled !== "boolean") throw new Error("Invalid generic evaluation enablement");
  const genericProvider = generic.provider ?? "openai";
  if (genericProvider !== "jev" && genericProvider !== "openai") throw new Error("Unsupported evaluation provider");
  const genericModel = generic.model ?? (genericProvider === "openai" ? "gpt-6-luna" : "jev-1.13.0");
  if (typeof genericModel !== "string" || !decisionProviderAdapter(genericProvider).validModel(genericModel)) throw new Error("Invalid evaluation model");
  const roots = generic.allowed_artifact_roots ?? [];
  if (!Array.isArray(roots) || roots.length > 256 || roots.some(value => typeof value !== "string" || !value || value.length > 4096 || /[\x00-\x1f]/u.test(value))) throw new Error("Invalid evaluation artifact roots");
  let dailyBudget: DecisionBudgetLimits | null = null;
  if (generic.daily_budget !== undefined) {
    const daily = object(generic.daily_budget, "evaluation daily budget");
    if (Object.keys(daily).some(key => !["max_calls", "max_request_bytes"].includes(key)) ||
        !Number.isSafeInteger(daily.max_calls) || Number(daily.max_calls) < 1 ||
        !Number.isSafeInteger(daily.max_request_bytes) || Number(daily.max_request_bytes) < 1) throw new Error("Invalid evaluation daily budget");
    dailyBudget = { maxCalls: Number(daily.max_calls), maxRequestBytes: Number(daily.max_request_bytes) };
  }
  if (generic.enabled === true && !dailyBudget) throw new Error("Enabled evaluation requires a finite daily budget");
  const evaluation: EvaluationSettings = { enabled: generic.enabled === true, provider: genericProvider as DecisionProviderId, model: genericModel,
    allowedArtifactRoots: [...new Set(roots as string[])], dailyBudget };
  const declared = settings["consumers"] === undefined ? {} : object(settings["consumers"], "continuity.decisions.consumers");
  for (const key of Object.keys(declared)) if (!(DECISION_CONSUMER_IDS as readonly string[]).includes(key)) throw new Error(`Unknown decision consumer: ${key}`);
  const notes: string[] = [];
  const legacyContext = legacy.allowedQuestions.includes(LEGACY_CONTEXT_QUESTION);
  if (Object.hasOwn(declared, "DL03") && legacyContext) {
    throw new Error("Declare DL03 through continuity.decisions.consumers or the old allowed_questions list, not both");
  }
  const consumers = {} as Record<DecisionConsumerId, ConsumerSetting>;
  for (const id of DECISION_CONSUMER_IDS) {
    consumers[id] = Object.hasOwn(declared, id) ? consumerSetting(declared[id], id) : { mode: "off", effect: "advise", effectSource: "default" };
  }
  if (legacyContext && !Object.hasOwn(declared, "DL03")) {
    consumers.DL03 = { mode: legacy.mode, effect: "advise", effectSource: "default" };
    notes.push("Legacy JSON provider health is retained as history; RC9 uses the user-local SQLite provider pool. Existing receipts and task allowances remain active.");
    notes.push(`Migrated allowed_questions:${LEGACY_CONTEXT_QUESTION} into consumers.DL03.mode=${legacy.mode} with the existing data, source and request limits.`);
  }
  for (const question of legacy.allowedQuestions) {
    if (question !== LEGACY_CONTEXT_QUESTION) notes.push(`Legacy allowed_questions:${question} is baseline-only; it enables no first-RC consumer.`);
  }
  const budget = budgetLimits(settings["budget"]);
  const contextBudget = budgetLimits(settings["budget"], DEFAULT_CONTEXT_BUDGET);
  const mode = legacy.mode;
  const questionIds = Object.fromEntries(DECISION_CONSUMER_IDS.map(id => {
    if (!Object.hasOwn(declared, id)) return [id, id === "DL03" && legacyContext ? ["legacy.context-rank/1"] : []];
    const questions = object(declared[id]).questions;
    if (questions === undefined) return [id, [...DECISION_CONSUMERS[id].defaultQuestions]];
    if (!Array.isArray(questions) || new Set(questions).size !== questions.length ||
        questions.some(question => typeof question !== "string" || !DECISION_CONSUMERS[id].questions.includes(question)))
      throw new Error(`Invalid or incompatible questions for ${id}`);
    if (id === "DL07" && new Set(questions.map(question => String(question).split("/")[0])).size !== questions.length)
      throw new Error("Select one version per validation question");
    return [id, [...questions]];
  })) as Record<DecisionConsumerId, string[]>;
  const modelRouting = modelRoutingSettings(root.continuity === undefined ? undefined : object(root.continuity).model_routing);
  const metadata = settings.allowed_metadata_paths ?? [];
  if (!Array.isArray(metadata) || metadata.length > 256 || metadata.some(path => typeof path !== "string" || !path || path.length > 512 ||
      path.startsWith("/") || /[\x00-\x1f\\]/u.test(path) || path.split("/").some((part: string) => part === ".." || part === ".")))
    throw new Error("Invalid metadata disclosure paths");
  const allowedMetadataPaths = [...new Set(metadata as string[])];
  const resolved: Omit<DecisionSettings, "configDigest"> = { mode, provider, evaluation, legacy, consumers, questionIds, budget, contextBudget, modelRouting, allowedMetadataPaths, migration: { notes } };
  return { ...resolved, configDigest: digest({ mode, ...(provider !== "jev" ? { provider } : {}), ...(settings.evaluation !== undefined ? { evaluation } : {}), model: legacy.model, revision: legacy.revision,
    allowedDataClasses: legacy.allowedDataClasses, allowedSourcePaths: legacy.allowedSourcePaths ?? [],
    deadlineMs: legacy.deadlineMs, evidenceBytes: legacy.evidenceBytes, maxCandidates: legacy.maxCandidates,
    consumers, questionIds, budget, contextBudget, modelRouting, allowedMetadataPaths }) };
}

export function loadProfileDecisionSettings(root: string): DecisionSettings {
  const path = "config/governance/profile.yaml";
  try { lstatSync(join(root, path)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return profileDecisionSettings({});
  }
  return profileDecisionSettings(parse(narrativeFile(root, path)));
}
export { loadProfileDecisionConfig };

/** Effective capability is the intersection of the global ceiling and the consumer's own setting. */
export function resolveConsumerMode(settings: DecisionSettings, id: DecisionConsumerId): { mode: DecisionMode; effect: DecisionEffect; effectSource: "declared" | "default"; ceiling: DecisionMode } {
  const consumer = settings.consumers[id];
  const mode = ORDER[settings.mode] < ORDER[consumer.mode] ? settings.mode : consumer.mode;
  const providerMode = settings.provider === "openai" && mode === "auto" ? "shadow" : mode;
  return { mode: providerMode, effect: consumer.effect, effectSource: consumer.effectSource, ceiling: settings.provider === "openai" && settings.mode === "auto" ? "shadow" : settings.mode };
}

/** Convert explicit E3 configuration through the same strict configuration owner. */
export function legacyDecisionSettings(config: DecisionConfig): DecisionSettings {
  return profileDecisionSettings({ continuity: { decisions: {
    mode: config.mode, ...(config.provider ? { provider: config.provider } : {}), config_revision: config.revision, model: config.model,
    allowed_questions: config.allowedQuestions, allowed_data_classes: config.allowedDataClasses,
    allowed_source_paths: config.allowedSourcePaths ?? [], deadline_ms: config.deadlineMs,
    evidence_bytes: config.evidenceBytes, max_candidates: config.maxCandidates,
    minimum_confidence: config.minimumConfidence,
  } } });
}
