import { parse } from "yaml";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";
import { DEFAULT_DECISIONS, validateDecisionConfig, type DecisionConfig } from "./decisions.ts";

/** Old profiles remain provider-free; malformed policy never silently authorizes data sharing. */
export function profileDecisionConfig(profile: unknown): DecisionConfig {
  const root = object(profile, "profile");
  if (root["continuity"] === undefined) return structuredClone(DEFAULT_DECISIONS);
  const continuity = object(root["continuity"], "continuity");
  if (continuity["decisions"] === undefined) return structuredClone(DEFAULT_DECISIONS);
  const settings = object(continuity["decisions"], "continuity.decisions");
  const mapping = { mode: "mode", config_revision: "revision", model: "model", allowed_questions: "allowedQuestions",
    allowed_data_classes: "allowedDataClasses", deadline_ms: "deadlineMs", evidence_bytes: "evidenceBytes",
    max_candidates: "maxCandidates", minimum_confidence: "minimumConfidence", allowed_source_paths: "allowedSourcePaths" } as const;
  if (settings["provider"] !== undefined && settings["provider"] !== "jev") throw new Error("Unsupported decision provider");
  for (const key of Object.keys(settings)) if (key !== "provider" && !Object.hasOwn(mapping, key)) throw new Error("Unknown decision configuration key");
  const result = structuredClone(DEFAULT_DECISIONS);
  for (const [external, internal] of Object.entries(mapping)) if (Object.hasOwn(settings, external)) {
    (result as unknown as Record<string, unknown>)[internal] = settings[external];
  }
  validateDecisionConfig(result);
  return result;
}

export function loadProfileDecisionConfig(root: string): DecisionConfig {
  const path = "config/governance/profile.yaml";
  try { lstatSync(join(root, path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULT_DECISIONS); throw error; }
  return profileDecisionConfig(parse(narrativeFile(root, path)));
}
