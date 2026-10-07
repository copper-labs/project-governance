import { CONTEXT_OPERATION_MS } from "./context-timing.ts";
import { MANAGED_CODEX_STARTUP_COMMAND } from "./startup-hooks.ts";
import { startupHooks } from "./startup-hooks.ts";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { narrativeFile } from "./narrative-inputs.ts";
import { routeContext } from "./context-routing.ts";
import { contextObservationStatus } from "./context-observations.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { profileDecisionSettings } from "./decision-settings.ts";
import { documentationReadiness } from "./context-documentation.ts";
import { projectionStatus } from "./context-projection-store.ts";
import { contextStateRoot } from "./context-command.ts";
import { inspectStartupHookSource } from "./startup-hook-source.ts";
import { contextBudgetReadiness } from "./context-budget-readiness.ts";
import { contextScopeCoverage } from "./context-scope-coverage.ts";
import { contextWorkspaceIdentity, contextWorkspaceAlignmentMessage } from "./context-workspace-identity.ts";
import { SOURCE_CAPTURE_MAX_BYTES, SOURCE_CAPTURE_BATCH_MAX_BYTES } from "./source-capture-limits.ts";

/** Configuration readback only; eligibility does not prove provider availability or host consumption. */
export interface ContextReadiness {
  version: 1;
  status: "ready" | "degraded" | "unavailable";
  selection: "off" | "not-configured" | "metadata-only" | "passages";
  mode: "off" | "shadow" | "auto" | null;
  provider: "not-requested" | "eligible-unproven" | "disabled" | "unknown";
  sharing: "not-requested" | "restricted" | "configured" | "unknown";
  promptHook: string;
  issues: string[];
  next: string;
  basis: "current-configuration-only";
  providerAvailability: "not-probed";
  hostConsumption: "not-observed";
}

/** Passive readiness, not host trust or successful first-read qualification. */
export function contextDoctor(workspace: string) {
  const findings: Array<{ id: string; message: string }> = [];
  const workspaceIdentity = contextWorkspaceIdentity(workspace);
  const alignmentMessage = contextWorkspaceAlignmentMessage(workspaceIdentity);
  if (alignmentMessage) findings.push({ id: "context.session-workspace-alignment", message: alignmentMessage });
  let requiredGuidance: Array<{ path: string; bytes: number | null }> = [];
  let budgets: ReturnType<typeof contextBudgetReadiness> | null = null;
  let metadata = { enabled: false, disclosure: false }, hook = "unavailable";
  let inference: Record<string, unknown> | null = null;
  let selection: ContextReadiness["selection"] = "not-configured";
  let effectiveMode: ContextReadiness["mode"] = null;
  let provider: ContextReadiness["provider"] = "unknown";
  let optionalExcerptBytes: number | undefined;
  let scopeCoverage: ReturnType<typeof contextScopeCoverage> | null = null;
  let hookSource: ReturnType<typeof inspectStartupHookSource> | null = null;
  try {
    const profile = parse(narrativeFile(workspace, "config/governance/profile.yaml"));
    if (!profile?.context_router) findings.push({ id: "context.router-missing", message: "Declare context_router and a default_route in config/governance/profile.yaml." });
    else {
      const route = routeContext(profile.context_router, "unspecified initial development request", []);
      optionalExcerptBytes = route.optionalExcerptBytes;
      if (route.outcome !== "matched") findings.push({ id: "context.no-default-route", message: "Prompts without matching paths or terms have no route. Declare default_route with required shared guidance." });
      budgets = contextBudgetReadiness(workspace, profile.context_router);
      requiredGuidance = budgets.requiredGuidance; findings.push(...budgets.findings);
    }
    const settings = profileDecisionSettings(profile);
    scopeCoverage = contextScopeCoverage(workspace, settings);
    const passageEnabled = settings.questionIds.DL03.includes("context.metadata-relevance/1") &&
      ["context.passage-evidence/1", "context.passage-role/1"].every(id => settings.questionIds.DL03.includes(id));
    metadata = { enabled: settings.mode !== "off" && settings.consumers.DL03.mode !== "off" && settings.questionIds.DL03.includes("context.metadata-relevance/1"),
      disclosure: settings.legacy.allowedDataClasses.includes("metadata") && Boolean(settings.allowedMetadataPaths?.length) };
    const eligibility = new DecisionRuntime(settings, contextStateRoot(workspace)).eligibility("DL03", "context.metadata-relevance/1");
    effectiveMode = eligibility.mode;
    const sourceApproved = settings.legacy.allowedDataClasses.includes("source") && Boolean(settings.legacy.allowedSourcePaths?.length);
    selection = eligibility.mode === "off" ? "off" : !metadata.enabled || !metadata.disclosure ? "not-configured"
      : passageEnabled && sourceApproved ? "passages" : "metadata-only";
    provider = eligibility.mode === "off" ? "not-requested"
      : eligibility.providerUse === "eligible" && metadata.enabled && metadata.disclosure ? "eligible-unproven" : "disabled";
    if (eligibility.mode !== "off" && eligibility.reasons.includes("missing-token"))
      findings.push({ id: "context.credentials-missing", message: "JEV selection is requested, but JEV_TOKEN is absent from this host environment. Local fallback remains available; no provider request was attempted." });
    if (eligibility.mode !== "off" && !metadata.enabled)
      findings.push({ id: "context.metadata-question-not-enabled", message: "JEV is requested for DL03, but its repository metadata question is not enabled. Inspect DL03 questions before claiming metadata selection readiness." });
    if (eligibility.mode !== "off" && passageEnabled && !sourceApproved)
      findings.push({ id: "context.passage-not-approved", message: "Passage questions are enabled, but source data and intended source paths are not both approved. Passage selection remains unavailable; review sharing consent without widening it automatically." });
    if (eligibility.mode !== "off" && scopeCoverage.status === "unavailable")
      findings.push({ id: "context.scope-unavailable", message: "Approved selection paths are configured, but the local Git inventory could not be inspected. Verify the worktree before claiming sharing-scope coverage; no index or provider probe was run." });
    inference = { configuredMode: settings.consumers.DL03.mode, effectiveMode: eligibility.mode, providerUse: eligibility.providerUse,
      reasons: eligibility.reasons, metadataApproved: metadata.disclosure, sourceClassApproved: settings.legacy.allowedDataClasses.includes("source"),
      descriptorPaths: settings.legacy.allowedSourcePaths ?? [], metadataPaths: settings.allowedMetadataPaths ?? [],
      passageQuestionsEnabled: passageEnabled,
      procedureSources: profile.context_router?.procedure_sources ?? [], descriptorPermissionAlsoPermitsBodies: true,
      limits: { requestBytes: settings.contextBudget.maxRequestBytes, calls: settings.contextBudget.maxCalls, operationMs: CONTEXT_OPERATION_MS,
        localSourceBytes: SOURCE_CAPTURE_MAX_BYTES, localSourceAggregateBytes: SOURCE_CAPTURE_BATCH_MAX_BYTES,
        sourceCandidates: settings.legacy.maxCandidates, optionalExcerptBytes: optionalExcerptBytes ?? (passageEnabled ? 3072 : 2048),
        passagePreparation: "remaining-family-bytes-and-operation" } };
    if (metadata.enabled && metadata.disclosure && !settings.legacy.allowedDataClasses.includes("source"))
      findings.push({ id: "context.path-only-disclosure", message: "Metadata is approved, but source-derived descriptions are not. JEV sees paths only; approve intended descriptions/body paths explicitly if appropriate." });
    if (metadata.enabled && !metadata.disclosure) findings.push({ id: "context.metadata-not-approved", message: "Metadata selection is enabled but needs explicit metadata data class and allowed_metadata_paths. Local retrieval still works." });
    if (metadata.enabled && metadata.disclosure && settings.legacy.allowedDataClasses.includes("source") &&
      settings.legacy.allowedSourcePaths?.length && !passageEnabled) findings.push({ id: "context.passage-not-enabled", message:
        "Source descriptions are approved, but passage selection is disabled. Explicitly enable context.passage-evidence/1 and context.passage-role/1 in DL03 to assess selected source sections; retain the intended sharing paths." });
  } catch { findings.push({ id: "context.configuration-unavailable", message: "Inspect the project profile, default route and its required files." }); }
  try {
    hookSource = inspectStartupHookSource(workspace);
    if (hookSource.shared && hookSource.status !== "current") findings.push({ id: "context.shared-hook-source", message:
      `Codex loads shared hooks from ${hookSource.path}; that source is ${hookSource.status}. Reconcile the main checkout at a coordinated seam before resuming linked worktrees. Updating only this worktree or restarting its chat does not repair the source.` });
    if (hookSource.status === "unavailable") throw new Error("Hook source cannot be inspected safely");
    const config = JSON.parse(narrativeFile(hookSource.definitionRoot, hookSource.path));
    const handlers = (config.hooks?.UserPromptSubmit ?? []).flatMap((group: any) => Array.isArray(group.hooks) ? group.hooks : []);
    const managed = handlers.filter((handler: any) => handler.command === MANAGED_CODEX_STARTUP_COMMAND);
    if(managed.length === 1 && managed[0].additionalContextLimit !== 0)
      findings.push({ id: "context.prompt-hook-preview", message: "The host can shorten this hook's context to a preview. Reconcile the managed prompt handler's additionalContextLimit to 0, then review its new hash in the host; governance enforces the packet byte limit." });
    let proposed:ReturnType<typeof startupHooks>|undefined;
    try { proposed=startupHooks(config,workspace,join(workspace,".governance/runtime/startup.sqlite")); }
    catch { hook="missing-or-conflicting"; }
    if(proposed) {
      const launcher=join(workspace,".governance/runtime/bin/project-governance"),entry=lstatSync(launcher,{throwIfNoEntry:false});
      const launcherReady=Boolean(entry?.isFile() && (entry.mode&0o111) && realpathSync(launcher)===launcher);
      hook=JSON.stringify(proposed.configuration)===JSON.stringify(config) && launcherReady ? "configured" : "missing-or-conflicting";
    }
  } catch {
    hook = "not-configured";
    if (!hookSource) findings.push({ id: "context.hook-source-unavailable", message: "Cannot establish Codex's project hook source from Git worktree identity; inspect it before claiming prompt readiness." });
  }
  if (hook !== "configured") findings.push({ id: "context.prompt-hook-unavailable", message: "Use startup hooks/install-hooks with startup.sqlite next to this worktree's registry, reconcile existing handlers, then trust the exact definitions in the host." });
  const projection = projectionStatus(contextStateRoot(workspace), workspace);
  const projectOverview = ["README.md", "CHARTER.md"].filter(path => {
    try { return narrativeFile(workspace, path).trim().length > 0; } catch { return false; }
  });
  const indexObservation = projection.status === "present" && "generations" in projection
    ? projection.generations.some(generation => Number(generation.paths) > 0) ? "populated-snapshot" : "empty-snapshot"
    : "not-observed";
  // Valid metadata-only and path-only configurations are useful, limited choices rather than activation failures.
  const suggestions = new Set(["context.path-only-disclosure", "context.passage-not-enabled"]);
  const issues = [...new Set(findings.filter(finding => !suggestions.has(finding.id)).map(finding => finding.id))];
  const readiness: ContextReadiness = { version: 1,
    status: inference === null ? "unavailable" : issues.length ? "degraded" : "ready",
    selection, mode: effectiveMode, provider,
    sharing: selection === "off" ? "not-requested" : scopeCoverage === null || scopeCoverage.status === "unavailable" ? "unknown"
      : scopeCoverage.status === "restricted" ? "restricted" : "configured",
    promptHook: hook, issues,
    next: issues.length ? findings.find(finding => finding.id === issues[0])!.message
      : selection === "off" ? "JEV is off. Local retrieval remains available; enabling it requires explicit configuration and sharing consent."
        : `Configured for ${selection === "passages" ? "metadata and passage" : "metadata-only"} selection. Provider availability and delivery to the model still require ordinary-use evidence.`,
    basis: "current-configuration-only", providerAvailability: "not-probed", hostConsumption: "not-observed" };
  return { version: 1, capability: "context", status: findings.length ? "needs-attention" : "configured", findings, metadata, inference, requiredGuidance,
    readiness,
    budgets: budgets ? { routes: budgets.routes, coverage: budgets.coverage } : null,
    localRetrieval: "provider-independent", promptHook: hook, promptHookSource: hookSource, hostTrust: "not-observable", beforeFirstRead: "requires-installed-host-evidence",
    projection, scopeCoverage, workspaceIdentity, repositoryContext: { indexObservation, overviewFiles: projectOverview, purposeQuality: "not-established",
      next: projectOverview.length ? "Confirm the overview describes current purpose and authoritative guidance; improve touched or repeatedly missed areas."
        : "For a new project, write a short purpose and point to its authoritative guidance. An empty index is not itself a runtime failure." },
    documentation: documentationReadiness(workspace), observations: contextObservationStatus(workspace), network: "not-attempted", mutations: "none" };
}
