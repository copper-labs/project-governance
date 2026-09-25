import { MANAGED_CODEX_STARTUP_COMMAND } from "./startup-hooks.ts";
import { startupHooks } from "./startup-hooks.ts";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { narrativeFile } from "./narrative-inputs.ts";
import { routeContext } from "./context-routing.ts";
import { contextObservationStatus } from "./context-observations.ts";
import { profileDecisionSettings } from "./decision-settings.ts";
import { documentationReadiness } from "./context-documentation.ts";
import { projectionStatus } from "./context-projection-store.ts";
import { contextStateRoot } from "./context-command.ts";

/** Passive readiness, not host trust or successful first-read qualification. */
export function contextDoctor(workspace: string) {
  const findings: Array<{ id: string; message: string }> = [];
  const requiredGuidance: Array<{ path: string; bytes: number | null }> = [];
  let metadata = { enabled: false, disclosure: false }, hook = "unavailable";
  try {
    const profile = parse(narrativeFile(workspace, "config/governance/profile.yaml"));
    if (!profile?.context_router) findings.push({ id: "context.router-missing", message: "Declare context_router and a default_route in config/governance/profile.yaml." });
    else {
      const route = routeContext(profile.context_router, "unspecified initial development request", []);
      if (route.outcome !== "matched") findings.push({ id: "context.no-default-route", message: "Prompts without matching paths or terms have no route. Declare default_route with required shared guidance." });
      let bytes = 0;
      for (const path of new Set([...route.primary, ...route.active])) {
        try {
          const size = Buffer.byteLength(narrativeFile(workspace, path));
          requiredGuidance.push({ path, bytes: size }); bytes += size;
        } catch {
          requiredGuidance.push({ path, bytes: null });
          findings.push({ id: "context.required-unavailable", message: `Required guidance is unavailable: ${path}` });
        }
      }
      if (bytes > 22000) findings.push({ id: "context.required-too-large", message: "Default required guidance exceeds the prompt packet. Shorten the owning guidance or reference background from it; do not silently drop requirements." });
    }
    const settings = profileDecisionSettings(profile);
    metadata = { enabled: settings.mode !== "off" && settings.consumers.DL03.mode !== "off" && settings.questionIds.DL03.includes("context.metadata-relevance/1"),
      disclosure: settings.legacy.allowedDataClasses.includes("metadata") && Boolean(settings.allowedMetadataPaths?.length) };
    if (metadata.enabled && !metadata.disclosure) findings.push({ id: "context.metadata-not-approved", message: "Metadata selection is enabled but needs explicit metadata data class and allowed_metadata_paths. Local retrieval still works." });
  } catch { findings.push({ id: "context.configuration-unavailable", message: "Inspect the project profile, default route and its required files." }); }
  try {
    const config = JSON.parse(narrativeFile(workspace, ".codex/hooks.json"));
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
  } catch { hook = "not-configured"; }
  if (hook !== "configured") findings.push({ id: "context.prompt-hook-unavailable", message: "Use startup hooks/install-hooks with startup.sqlite next to this worktree's registry, reconcile existing handlers, then trust the exact definitions in the host." });
  return { version: 1, capability: "context", status: findings.length ? "needs-attention" : "configured", findings, metadata, requiredGuidance,
    localRetrieval: "provider-independent", promptHook: hook, hostTrust: "not-observable", beforeFirstRead: "requires-installed-host-evidence",
    projection: projectionStatus(contextStateRoot(workspace), workspace),
    documentation: documentationReadiness(workspace), observations: contextObservationStatus(workspace), network: "not-attempted", mutations: "none" };
}
