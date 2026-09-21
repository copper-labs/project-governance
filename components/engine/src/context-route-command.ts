import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { parse } from "yaml";
import { resolveChangeScope, safeSubjectPath, ValidationSubject, worktreeBytes } from "./change-subject.ts";
import { object, text, digest, durableJson } from "./core.ts";
import { routeContext } from "./context-routing.ts";
import { materializeRoutedContext } from "./routed-context.ts";
import { loadSkillCatalog, type CatalogSkill } from "./skill-catalog.ts";
import { contextStateRoot } from "./context-command.ts";
import { buildContextPacket } from "./context-packet.ts";
import { JevDecisionAdapter, type DecisionProvider, type DecisionOptions, type Candidate } from "./decisions.ts";
import { profileDecisionConfig } from "./decision-configuration.ts";
import { discoverContext } from "./context-discovery.ts";
import { profileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { contextAdvice, type ContextAdvice } from "./decision-context-advice.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { resolveWorkflowCandidates, workflowAdvice } from "./decision-workflow-advice.ts";

/** Mandatory routing runs without a provider. Only captured project configuration selects requirements. */
export async function contextRouteCommand(args: string[], root: string,
  assetRoot = fileURLToPath(new URL("../assets/skills/", import.meta.url)), suppliedProvider?: DecisionProvider, options: DecisionOptions = {}) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    task: { type: "string" }, revision: { type: "string" }, staged: { type: "boolean" },
    "decision-task": { type: "string" },
    "workflow-candidates": { type: "string" },
    "base-ref": { type: "string" }, "include-expansion": { type: "boolean" }, "include-evaluation-skills": { type: "boolean" },
    "optional-excerpt-bytes": { type: "string" },
    "changed-path": {type:"string",multiple:true},
    "optional-path": { type: "string", multiple: true }, "discover-path": { type: "string", multiple: true },
  } });
  const task = text(values.task, "task"), revision = text(values.revision, "task revision");
  if (values.staged && values["base-ref"]) throw new Error("Staged context cannot select another base");
  root = realpathSync(root);
  const scope = resolveChangeScope(root, values.staged ? { staged: true } : { baseRef: values["base-ref"] ?? "HEAD" });
  const subject = new ValidationSubject(root, scope);
  const configDigests: Record<string, string> = {};
  const load = (path: string) => {
    if (subject.source(path)?.file_type !== "regular") throw new Error("Context configuration unavailable");
    const bytes = subject.read(path, 1024 * 1024);
    configDigests[path] = digest(bytes.toString("base64"));
    return object(parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), "context configuration");
  };
  const profile = load("config/governance/profile.yaml"), factsDocument = load("config/governance/facts.lock.yaml");
  if (profile.profile_id && factsDocument.profile_id && profile.profile_id !== factsDocument.profile_id) throw new Error("Context profile identity mismatch");
  const facts = object(factsDocument.facts ?? {}), contextFacts = facts.skill_context == null ? null : object(facts.skill_context);
  const requestedPaths=values["changed-path"];
  if(requestedPaths && requestedPaths.length>64)throw new Error("Too many explicit routing paths");
  const paths = requestedPaths ? [...new Set(requestedPaths.map(safeSubjectPath))].sort() : scope.records.map(record => record.path);
  const routingPaths={mode:requestedPaths?"explicit":"captured-changes",paths};
  const route = routeContext(profile.context_router, task, paths);
  const targetSkillPaths: string[] = [];
  const localSkillDigests = new Map<string, string>();
  const targetSkill = (id: string): CatalogSkill | null => {
    const path = `.governance/runtime/skills/${id}/SKILL.md`;
    const source = subject.source(path);
    let bytes: Buffer;
    if (source?.file_type === "regular") {
      bytes = subject.read(path, 16000); targetSkillPaths.push(path);
    } else {
      // Staged proof must never import ignored/live guidance outside its selected Git subject.
      if (source || values.staged || scope.records.some(record => record.path === path)) return null;
      try {
        const captured = worktreeBytes(root, path, 16000);
        if (captured.type !== "regular") return null;
        bytes = captured.bytes;
        localSkillDigests.set(path, digest(bytes.toString("base64")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    }
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { id, path, content, sourceDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      packId: null, activationMode: "governed", defaultLevel: "required", capabilityOwner: null,
      applicability: {}, conflicts: [], references: [], routerFor: [] };
  };
  const packet = materializeRoutedContext(subject, route, values["include-expansion"], {
    index: loadSkillCatalog(assetRoot), task, changedPaths: paths, facts: contextFacts, includeEvaluation: values["include-evaluation-skills"] ?? false, targetSkill,
  });
  const discovery = values["discover-path"]?.length ? discoverContext(subject, values["discover-path"]) : null;
  const mandatoryPaths = new Set([...route.primary, ...route.active, ...route.expansion]);
  const optionalPaths = [...new Set([...(values["optional-path"] ?? []), ...(discovery?.paths ?? [])])].filter(path => !mandatoryPaths.has(path));
  if (optionalPaths.length > 64) throw new Error("Too many optional context inputs");
  const candidates: Candidate[] = optionalPaths.map(path => {
    if (path.length > 128 || subject.source(path)?.file_type !== "regular") throw new Error("Optional source unavailable");
    const bytes = subject.read(path, 1024 * 1024);
    return { id: path, excerpt: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      sourceDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  });
  const optionalBudget = Math.max(0, Math.min(packet.limits.expansion - packet.used.expansion, packet.limits.total - packet.used.total));
  const settings = profileDecisionSettings(profile);
  const decisionScope = resolveDecisionScope(root, { ...(values["decision-task"] === undefined ? {} : { taskId: values["decision-task"] }), revision });
  let relevanceAdvice: ContextAdvice | null = null;
  const expandedContext = settings.questionIds.DL03.includes("context.relevance/1");
  const provider: DecisionProvider = suppliedProvider ?? (expandedContext ? {
    async decide(request) {
      relevanceAdvice = await contextAdvice(new DecisionRuntime(settings, contextStateRoot(root), options), request.candidates, decisionScope, {
        purpose: task, eventId: digest({ revision, purpose: task, source: scope.subject_digest, candidates: request.candidates }),
        policyDigest: digest(configDigests), environment: scope.mode, revision, subjectDigest: scope.subject_digest ?? digest(configDigests),
        excerptBytes: settings.legacy.evidenceBytes,
      });
      const decision = relevanceAdvice.decision;
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: relevanceAdvice.order,
        suggested: relevanceAdvice.delivered ? relevanceAdvice.order : null, method: relevanceAdvice.delivered ? "jev" : "baseline",
        reason: relevanceAdvice.reason, model: decision?.model ?? null, questionVersion: "context.relevance/1",
        confidence: null, latencyMs: decision?.latencyMs ?? 0, usage: decision?.usage ?? { inputTokens: null, outputTokens: null } };
    },
  } : new JevDecisionAdapter(profileDecisionConfig(profile), join(contextStateRoot(root), "provider-health.json"), { scope: decisionScope, settings }));
  // Invalid mandatory context prevents any optional provider call or source transmission.
  const optional = packet.ready && candidates.length && optionalBudget >= 2 ? await buildContextPacket({
    taskRevision: revision, purpose: task, required: [], optional: candidates, maximumBytes: optionalBudget,
    ...(values["optional-excerpt-bytes"] !== undefined ? { optionalExcerptBytes: Number(values["optional-excerpt-bytes"]) } : {}),
  }, provider, options) : null;
  let workflowRecommendation = null;
  if (packet.ready) {
    const manifestPath = values["workflow-candidates"] === undefined ? null : safeSubjectPath(values["workflow-candidates"]);
    const supplied = manifestPath ? resolveWorkflowCandidates(load(manifestPath), root, subject) : null;
    const workflowPaths = [...new Set([...(manifestPath ? [manifestPath] : []), ...(supplied?.sourcePaths ?? [])])];
    for (const path of workflowPaths) if (subject.source(path)?.file_type === "regular") {
      configDigests[path] = digest(subject.read(path, 1024 * 1024).toString("base64"));
    }
    workflowRecommendation = await workflowAdvice(new DecisionRuntime(settings, contextStateRoot(root), options), supplied, decisionScope, {
      task, eventId: digest({ task, revision, supplied, source: scope.subject_digest }), policyDigest: digest(configDigests),
      environment: scope.mode, revision, subjectDigest: scope.subject_digest ?? digest(configDigests), sourcePaths: workflowPaths,
    });
  }
  const staleSources: string[] = [];
  // Re-read every captured candidate, including omitted sources, after optional advice returns.
  for (const path of [...Object.keys(configDigests), ...packet.entries.map(entry => entry.path), ...optionalPaths, ...targetSkillPaths]) {
    try { subject.read(path, 1024 * 1024); } catch { staleSources.push(path); }
  }
  for (const [path, expected] of localSkillDigests) {
    try {
      const current = worktreeBytes(root, path, 16000);
      if (current.type !== "regular" || digest(current.bytes.toString("base64")) !== expected) staleSources.push(path);
    } catch { staleSources.push(path); }
  }
  const receiptId = randomUUID();
  const identity = { revision, taskDigest: digest(task), configDigests, routingPaths, route: route.selected?.id ?? null,
    source: { mode: scope.mode, base: scope.base_ref, changes: scope.subject_digest },
    context: packet.entries.map(({ content, ...entry }) => entry),
    skills: packet.skills?.entries.map(({ content, reasons, ...entry }) => entry) ?? [],
    optionalSources: candidates.map(({ excerpt, ...entry }) => entry),
    localSkillSources: Object.fromEntries(localSkillDigests) };
  const receipt = { version: 1, receiptId, createdAt: new Date().toISOString(), ...identity,
    inputDigest: digest(identity), ready: packet.ready && !staleSources.length, blockers: packet.blockers,
    omissions: packet.omissions, skillOmissions: packet.skills?.omissions ?? [],
    optional: optional ? { selected: optional.entries.map(entry => entry.id), omitted: optional.omitted,
      decision: optional.decision, measurement: optional.measurement, reason: optional.reason } : null,
    relevanceAdvice, workflowAdvice: workflowRecommendation, discovery, staleSources, outcome: staleSources.length ? "refused-stale-source" : packet.ready ? "delivered" : "blocked" };
  durableJson(join(contextStateRoot(root), "routes", `${receiptId}.json`), receipt);
  if (staleSources.length) throw new Error("Context sources changed while preparing the routed packet");
  return { ...packet, route, routingPaths, receiptId, inputDigest: receipt.inputDigest, revision, source: identity.source,
    optional, relevanceAdvice: relevanceAdvice as ContextAdvice | null, workflowAdvice: workflowRecommendation,
    optionalBudget, optionalOmitted: optional?.omitted ?? optionalPaths, discovery };
}
