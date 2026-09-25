import { decisionBudgetStoreStatus } from "./decision-budget.ts";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings, resolveConsumerMode } from "./decision-settings.ts";
import { DECISION_CONSUMER_IDS } from "./decision-schema.ts";
import { DECISION_CONSUMERS } from "./decision-catalog.ts";

/** Configuration visibility only: never send evidence, probe credentials or mutate provider health. */
export function decisionDoctor(workspace: string, environment: NodeJS.ProcessEnv = process.env) {
  try {
    const settings = loadProfileDecisionSettings(workspace), config = settings.legacy;
    const tokenPresent = Boolean(environment.JEV_TOKEN);
    const reasons: string[] = [];
    if (config.mode === "off") reasons.push("off");
    if (!tokenPresent) reasons.push("missing-token");
    if (!config.allowedQuestions.length && !DECISION_CONSUMER_IDS.some(id => settings.consumers[id].mode !== "off" && settings.questionIds[id].length)) reasons.push("questions-disabled");
    if (!config.allowedDataClasses.length) reasons.push("data-sharing-disabled");
    const sourceEnabled = config.allowedDataClasses.includes("source") && Boolean(config.allowedSourcePaths?.length);
    if (config.allowedDataClasses.length === 1 && config.allowedDataClasses[0] === "source" && !sourceEnabled) reasons.push("source-scope-disabled");
    return { version: 1, capability: "decisions", status: "passed", mode: config.mode,
      provider: "jev", model: config.model, tokenPresent, providerUse: reasons.length ? "disabled" : "eligible",
      reasons, fallback: "deterministic-baseline", allowedQuestions: config.allowedQuestions,
      allowedDataClasses: config.allowedDataClasses, sourceScopeConfigured: sourceEnabled,
      limits: { deadlineMs: config.deadlineMs, evidenceBytes: config.evidenceBytes, maxCandidates: config.maxCandidates },
      consumers: Object.fromEntries(DECISION_CONSUMER_IDS.map(id => {
        const resolved = resolveConsumerMode(settings, id), dataClass = DECISION_CONSUMERS[id].dataClass;
        const metadataEnabled = id === "DL03" && settings.questionIds[id].includes("context.metadata-relevance/1") && config.allowedDataClasses.includes("metadata") && Boolean(settings.allowedMetadataPaths?.length);
        const disabled = resolved.mode === "off" || !tokenPresent || !settings.questionIds[id].length ||
          (!metadataEnabled && (!config.allowedDataClasses.includes(dataClass) || (dataClass === "source" && !sourceEnabled)));
        return [id, { ...resolved, questions: settings.questionIds[id], providerUse: disabled ? "disabled" : "eligible", ...(id === "DL03" ? { metadataEnabled } : {}) }];
      })),
      budget: settings.budget, budgetStore: decisionBudgetStoreStatus(contextStateRoot(workspace)), migration: settings.migration,
      expandedProviderHealthReset: "Change continuity.decisions.config_revision to open a fresh health epoch after investigating a persistent provider lock. Existing locks are never deleted automatically.",
      network: "not-attempted", providerHealth: "not-probed", benefit: "not-evaluated", mutation: "none" };
  } catch {
    return { version: 1, capability: "decisions", status: "failed", providerUse: "invalid-configuration",
      findings: [{ id: "decisions.configuration-invalid", message: "Correct continuity.decisions in the project profile before using decision assistance." }],
      network: "not-attempted", mutation: "none" };
  }
}
