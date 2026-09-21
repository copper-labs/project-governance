import { loadProfileDecisionConfig } from "./decision-configuration.ts";

/** Configuration visibility only: never send evidence, probe credentials or mutate provider health. */
export function decisionDoctor(workspace: string, environment: NodeJS.ProcessEnv = process.env) {
  try {
    const config = loadProfileDecisionConfig(workspace);
    const tokenPresent = Boolean(environment.JEV_TOKEN);
    const reasons: string[] = [];
    if (config.mode === "off") reasons.push("off");
    if (!tokenPresent) reasons.push("missing-token");
    if (!config.allowedQuestions.length) reasons.push("questions-disabled");
    if (!config.allowedDataClasses.length) reasons.push("data-sharing-disabled");
    const sourceEnabled = config.allowedDataClasses.includes("source") && Boolean(config.allowedSourcePaths?.length);
    if (config.allowedDataClasses.length === 1 && config.allowedDataClasses[0] === "source" && !sourceEnabled) reasons.push("source-scope-disabled");
    return { version: 1, capability: "decisions", status: "passed", mode: config.mode,
      provider: "jev", model: config.model, tokenPresent, providerUse: reasons.length ? "disabled" : "eligible",
      reasons, fallback: "deterministic-baseline", allowedQuestions: config.allowedQuestions,
      allowedDataClasses: config.allowedDataClasses, sourceScopeConfigured: sourceEnabled,
      limits: { deadlineMs: config.deadlineMs, evidenceBytes: config.evidenceBytes, maxCandidates: config.maxCandidates },
      network: "not-attempted", providerHealth: "not-probed", benefit: "not-evaluated", mutation: "none" };
  } catch {
    return { version: 1, capability: "decisions", status: "failed", providerUse: "invalid-configuration",
      findings: [{ id: "decisions.configuration-invalid", message: "Correct continuity.decisions in the project profile before using decision assistance." }],
      network: "not-attempted", mutation: "none" };
  }
}
