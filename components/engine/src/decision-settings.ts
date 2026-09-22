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
export interface DecisionSettings {
  /** The existing top-level mode is the global ceiling over every consumer. */
  mode: DecisionMode;
  legacy: DecisionConfig;
  consumers: Record<DecisionConsumerId, ConsumerSetting>;
  budget: DecisionBudgetLimits;
  migration: { notes: string[] };
  /** Explicit opt-in to new questions is separate from legacy context-ranking permission. */
  questionIds: Record<DecisionConsumerId, string[]>;
  configDigest: string;
  modelRouting: ModelRoutingSettings;
}

export const DEFAULT_DECISION_BUDGET: DecisionBudgetLimits = { maxCalls: 16, maxRequestBytes: 131_072 };
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

function budgetLimits(raw: unknown): DecisionBudgetLimits {
  if (raw === undefined) return { ...DEFAULT_DECISION_BUDGET };
  const entry = object(raw, "continuity.decisions.budget");
  for (const key of Object.keys(entry)) if (!["max_calls", "max_request_bytes"].includes(key)) throw new Error(`Unknown decision budget key: ${key}`);
  const maxCalls = entry["max_calls"] ?? DEFAULT_DECISION_BUDGET.maxCalls;
  const maxRequestBytes = entry["max_request_bytes"] ?? DEFAULT_DECISION_BUDGET.maxRequestBytes;
  if (!Number.isSafeInteger(maxCalls) || (maxCalls as number) < 1 || (maxCalls as number) > 1024 ||
      !Number.isSafeInteger(maxRequestBytes) || (maxRequestBytes as number) < 1024 || (maxRequestBytes as number) > 8 * 1024 * 1024) throw new Error("Invalid decision budget bounds");
  return { maxCalls: maxCalls as number, maxRequestBytes: maxRequestBytes as number };
}

/**
 * Resolve the old E3 profile and the first-RC consumer settings once into one canonical owner.
 * New consumers default off, an omitted effect resolves to advice and conflicting declarations fail.
 */
export function profileDecisionSettings(profile: unknown): DecisionSettings {
  const legacy = profileDecisionConfig(profile);
  const root = object(profile, "profile");
  const settings = root["continuity"] === undefined ? {} : object(object(root["continuity"], "continuity")["decisions"] ?? {}, "continuity.decisions");
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
    notes.push("Legacy provider-health.json suppression is not carried into the shared health epoch; the first eligible request rechecks provider health. Existing files are retained.");
    notes.push(`Migrated allowed_questions:${LEGACY_CONTEXT_QUESTION} into consumers.DL03.mode=${legacy.mode} with the existing data, source and request limits.`);
  }
  for (const question of legacy.allowedQuestions) {
    if (question !== LEGACY_CONTEXT_QUESTION) notes.push(`Legacy allowed_questions:${question} is baseline-only; it enables no first-RC consumer.`);
  }
  const budget = budgetLimits(settings["budget"]);
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
  const resolved: Omit<DecisionSettings, "configDigest"> = { mode, legacy, consumers, questionIds, budget, modelRouting, migration: { notes } };
  return { ...resolved, configDigest: digest({ mode, model: legacy.model, revision: legacy.revision,
    allowedDataClasses: legacy.allowedDataClasses, allowedSourcePaths: legacy.allowedSourcePaths ?? [],
    deadlineMs: legacy.deadlineMs, evidenceBytes: legacy.evidenceBytes, maxCandidates: legacy.maxCandidates,
    consumers, questionIds, budget, modelRouting }) };
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
  return { mode, effect: consumer.effect, effectSource: consumer.effectSource, ceiling: settings.mode };
}

/** Convert explicit E3 configuration through the same strict configuration owner. */
export function legacyDecisionSettings(config: DecisionConfig): DecisionSettings {
  return profileDecisionSettings({ continuity: { decisions: {
    mode: config.mode, config_revision: config.revision, model: config.model,
    allowed_questions: config.allowedQuestions, allowed_data_classes: config.allowedDataClasses,
    allowed_source_paths: config.allowedSourcePaths ?? [], deadline_ms: config.deadlineMs,
    evidence_bytes: config.evidenceBytes, max_candidates: config.maxCandidates,
    minimum_confidence: config.minimumConfidence,
  } } });
}
