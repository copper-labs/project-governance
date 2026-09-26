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
import { resolveTaskContext, taskBindingReceipt } from "./decision-task-binding.ts";
import { decisionTaskPurpose, type DecisionTaskContext } from "./decision-task-context.ts";
import { automaticContextCandidates, contextCandidateInventory } from "./context-candidates.ts";
import { recordEntryExposure } from "./decision-episodes.ts";
import { ContextRouteError, recordContextFailure } from "./context-route-errors.ts";
import { contextMetadataCatalog, selectContextMetadata } from "./context-metadata.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { openContextFamily, type ContextFamilyIdentity } from "./decision-budget.ts";
import { maintainContextProjection } from "./context-projection.ts";
import { expansionIdentity, beginContextSelection, finishContextSelection, nextContextExpansion } from "./context-family.ts";
import { ContextTiming } from "./context-timing.ts";
import { currentTaskRefresh, latestSessionPrompt } from "./context-observations.ts";
import { sessionId } from "../../harness/src/store/location.ts";

export interface ContextRouteOptions extends DecisionOptions {
  operationStartedAt?: number;
  session?: string;
  workspaceCatalog?: boolean;
  provisionalScope?: BudgetScope;
  maximumOptionalBytes?: number;
  historyHints?: string[];
  promptEntry?: boolean;
  retrievalEvent?: string;
  /** Storage-degraded native entry: deterministic context remains usable without paid advice or a durable receipt. */
  localOnly?: boolean;
  family?: { id: string; step: number; scope: BudgetScope; revision: string; identity?: ContextFamilyIdentity; transitionId?: string | null; automaticRefresh?: boolean };
}

type MetadataSelection = Awaited<ReturnType<typeof selectContextMetadata>>;
type ContextSettings = ReturnType<typeof profileDecisionSettings>;
type CapturedScope = ReturnType<typeof resolveChangeScope>;

/** Optional source capture keeps explicit failures visible and records automatic misses. */
function readOptionalCandidates(subject: ValidationSubject, paths: string[], explicit: Set<string>,
  automatic: ReturnType<typeof automaticContextCandidates>, readCaptured: (path: string, limit: number) => Buffer): Candidate[] {
  const candidates: Candidate[] = [];
  for (const path of paths) {
    try {
      if (path.length > 128 || subject.source(path)?.file_type !== "regular") throw new Error("Optional source unavailable");
      const bytes = readCaptured(path, 1024 * 1024);
      if (bytes.includes(0)) throw new Error("Binary optional source");
      candidates.push({ id: path, excerpt: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        sourceDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
    } catch (error) {
      if (explicit.has(path)) throw error;
      automatic.excluded.push({ path, reason: "source-unavailable-or-not-bounded-text" }); automatic.excludedCount++;
    }
  }
  return candidates;
}

/** Keep the optional provider policy separate from required routing and captured-source checks. */
function routedDecisionProvider(input: { supplied: DecisionProvider | undefined; options: ContextRouteOptions; settings: ContextSettings;
  metadata: MetadataSelection | null; profile: Record<string, unknown>; root: string; scope: CapturedScope;
  decisionScope: BudgetScope | null; configDigests: Record<string, string>; task: string; revision: string;
  onAdvice: (advice: ContextAdvice) => void }): DecisionProvider {
  const { supplied, options, settings, metadata, profile, root, scope, decisionScope, configDigests, task, revision, onAdvice } = input;
  if (supplied) return supplied;
  if ((options.promptEntry || settings.questionIds.DL03.includes("context.metadata-relevance/1")) && metadata) return {
    async decide(request) {
      const available = new Set(request.candidates.map(item => item.id));
      const order = [...new Set([...metadata.order.filter(path => available.has(path)), ...available])];
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: order, suggested: metadata.delivered ? order : null,
        method: metadata.delivered ? "jev" : "baseline", reason: metadata.reason, model: metadata.decisions.find(item => item.model)?.model ?? null,
        questionVersion: "context.metadata-relevance/1", confidence: null, latencyMs: metadata.decisions.reduce((sum, item) => sum + item.latencyMs, 0),
        usage: { inputTokens: null, outputTokens: null } };
    },
  };
  if (settings.questionIds.DL03.includes("context.relevance/1")) return {
    async decide(request) {
      const policyDigest = digest({ captured: configDigests, decisions: settings.configDigest });
      const advice = await contextAdvice(new DecisionRuntime(settings, contextStateRoot(root), options), request.candidates, decisionScope, {
        purpose: task, eventId: digest({ revision, purpose: task, source: scope.subject_digest,
          candidates: request.candidates, policyDigest }),
        policyDigest, environment: scope.mode, revision, subjectDigest: scope.subject_digest ?? digest(configDigests),
        excerptBytes: settings.legacy.evidenceBytes,
      });
      onAdvice(advice);
      const decision = advice.decision;
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: advice.order,
        suggested: advice.delivered ? advice.order : null, method: advice.delivered ? "jev" : "baseline",
        reason: advice.reason, model: decision?.model ?? null, questionVersion: "context.relevance/1",
        confidence: null, latencyMs: decision?.latencyMs ?? 0, usage: decision?.usage ?? { inputTokens: null, outputTokens: null } };
    },
  };
  return new JevDecisionAdapter(profileDecisionConfig(profile), join(contextStateRoot(root), "provider-health.json"), { scope: decisionScope, settings });
}

/** Receipts are previews; full decisions and source facts remain with their owning records. */
function metadataReceiptPreview(metadata: MetadataSelection | null) {
  if (!metadata) return null;
  const { cursor: _cursor, ...fields } = metadata;
  return { ...fields,
    catalog: { ...metadata.catalog, candidates: metadata.catalog.candidates.slice(0, 64), previewOnly: metadata.catalog.candidates.length > 64 },
    catalogDigest: digest(metadata.catalog.candidates), order: metadata.order.slice(0, 64), assessed: metadata.assessed.slice(0, 64),
    assessedCount: metadata.assessed.length, excluded: metadata.excluded.slice(0, 64),
    sourceIndex: { ...metadata.sourceIndex, descriptionOmissions: metadata.sourceIndex.descriptionOmissions.slice(0, 64) },
    decisions: metadata.decisions.map(({ receiptId, reason, mode, delivered, providerCalled, model, latencyMs, usage }) =>
      ({ receiptId, reason, mode, delivered, providerCalled, model, latencyMs, usage })) };
}

function projectionReceiptPreview(projection: ReturnType<typeof maintainContextProjection>, admitted: Set<string>) {
  return { ...projection.status, generation: projection.generation, priority: projection.priority.slice(0, 64),
    links: projection.links.filter(link => admitted.has(link.source) || link.resolved && admitted.has(link.resolved)).slice(0, 64),
    declarations: projection.catalogLinks.filter(link => admitted.has(link.source)).slice(0, 64) };
}

/** Mandatory routing runs without a provider. Only captured project configuration selects requirements. */
export async function contextRouteCommand(args: string[], root: string,
  assetRoot = fileURLToPath(new URL("../assets/skills/", import.meta.url)), suppliedProvider?: DecisionProvider, options: ContextRouteOptions = {}, taskContext?: DecisionTaskContext) {
  const timing = new ContextTiming(options.operationStartedAt), controller = new AbortController();
  const timer = setTimeout(() => controller.abort("context-operation-deadline"), Math.max(0, timing.deadline - performance.now()));
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try { return await capturedContextRoute(args, root, assetRoot, suppliedProvider, { ...options, signal }, timing, taskContext); }
  catch (error) {
    throw recordContextFailure(root, error);
  } finally { clearTimeout(timer); }
}

async function capturedContextRoute(args: string[], root: string, assetRoot: string,
  suppliedProvider: DecisionProvider | undefined, options: ContextRouteOptions, timing: ContextTiming, taskContext?: DecisionTaskContext) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    task: { type: "string" }, revision: { type: "string" }, staged: { type: "boolean" },
    "decision-task": { type: "string" },
    "decision-context": { type: "string" },
    "workflow-candidates": { type: "string" },
    "base-ref": { type: "string" }, "include-expansion": { type: "boolean" }, "include-evaluation-skills": { type: "boolean" },
    "optional-excerpt-bytes": { type: "string" },
    "changed-path": {type:"string",multiple:true},
    "optional-path": { type: "string", multiple: true }, "discover-path": { type: "string", multiple: true },
    entry: { type: "string" }, expansion: { type: "string" }, links: { type: "string", multiple: true },
  } });
  let automaticRefresh = false;
  // A deliberate bind can refresh the same turn through the ordinary command, without retry diagnosis.
  if (!values.entry && !options.family && !values.staged && !values["decision-task"] && !values["decision-context"] && !taskContext) {
    const session = sessionId(options.session);
    if (session) {
      const latest = latestSessionPrompt(root, session).entry;
      const current = taskBindingReceipt(resolveTaskContext(root, { session }));
      if (latest && currentTaskRefresh(root, latest, current)) {
        automaticRefresh = true;
        values.entry = String(latest.entryId);
        values.expansion = String(nextContextExpansion(root, values.entry));
      }
    }
  }
  if (values.entry || values.expansion) {
    if (!values.entry || !["1", "2"].includes(values.expansion ?? "") || options.family || values.staged || values["decision-task"] || values["decision-context"] || taskContext)
      throw new Error("Use context-route --entry <entry-id> --expansion 1|2 with the current purpose and optional paths or links");
    const selected = expansionIdentity(root, values.entry, options.session);
    options = { ...options, session: selected.session, promptEntry: true, workspaceCatalog: true,
      family: { id: values.entry, step: Number(values.expansion), scope: selected.scope, revision: selected.revision, transitionId: selected.transitionId, automaticRefresh } };
  }
  const binding = resolveTaskContext(root, { ...(taskContext ? { context: taskContext } : {}),
    ...(values["decision-context"] ? { path: values["decision-context"] } : {}),
    ...(values["decision-task"] ? { taskId: values["decision-task"] } : {}), ...(values.revision ? { revision: values.revision } : {}),
    ...(options.session ? { session: options.session } : {}) });
  if (!binding.context && (!values.task || !values.revision && !options.family)) throw new Error(`Task context unavailable (${binding.status}); create or resume this session's harness task, or supply explicit --task and --revision.`);
  const task = text(values.task ?? (binding.context ? decisionTaskPurpose(binding.context) : undefined), "task", 16000),
    revision = text(values.revision ?? binding.context?.revision ?? options.family?.revision, "task revision");
  if (values.staged && values["base-ref"]) throw new Error("Staged context cannot select another base");
  root = realpathSync(root);
  const scope = resolveChangeScope(root, values.staged ? { staged: true } : { baseRef: values["base-ref"] ?? "HEAD" });
  const subject = new ValidationSubject(root, scope, { workingTree: !values.staged });
  const configDigests: Record<string, string> = {};
  const capturedSubjectPaths = new Set<string>();
  const readCaptured = (path: string, limit: number) => {
    const bytes = subject.read(path, limit);
    capturedSubjectPaths.add(path);
    return bytes;
  };
  const load = (path: string) => {
    if (subject.source(path)?.file_type !== "regular") throw new Error("Context configuration unavailable");
    const bytes = readCaptured(path, 1024 * 1024);
    configDigests[path] = digest(bytes.toString("base64"));
    return object(parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), "context configuration");
  };
  const profile = load("config/governance/profile.yaml"), factsDocument = load("config/governance/facts.lock.yaml");
  if (profile.profile_id && factsDocument.profile_id && profile.profile_id !== factsDocument.profile_id) throw new Error("Context profile identity mismatch");
  const facts = object(factsDocument.facts ?? {}), contextFacts = facts.skill_context == null ? null : object(facts.skill_context);
  const requestedPaths=values["changed-path"];
  if(requestedPaths && requestedPaths.length>64)throw new Error("Too many explicit routing paths");
  const emptyScope = !!binding.context && !binding.context.sourcePaths.length && !requestedPaths;
  const pathScopes = requestedPaths ? [...new Set(requestedPaths.map(safeSubjectPath))].sort()
    : binding.context?.sourcePaths.length ? binding.context.sourcePaths : scope.records.map(record => record.path);
  const settings = profileDecisionSettings(profile);
  const inventory = contextCandidateInventory(subject, pathScopes, scope.records.map(record => record.path));
  const paths = inventory.routingPaths;
  const routingPaths={mode:requestedPaths?"explicit":emptyScope?"bound-task-empty-scope":binding.context?"bound-task":"captured-changes",paths};
  if (profile.context_router === undefined) throw new ContextRouteError("router-missing",
    "Configure context_router in config/governance/profile.yaml, including a default_route for prompts without a path match.");
  const route = routeContext(profile.context_router, task, paths);
  const localSkillDigests = new Map<string, string>();
  const targetSkill = (id: string): CatalogSkill | null => {
    const path = `.governance/runtime/skills/${id}/SKILL.md`;
    const source = subject.source(path);
    let bytes: Buffer;
    if (source?.file_type === "regular") {
      bytes = readCaptured(path, 16000);
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
  if (inventory.unavailable) {
    packet.blockers.push("context-inventory-unavailable"); packet.filesReady = false; packet.ready = false;
  }
  const discovery = values["discover-path"]?.length ? discoverContext(subject, values["discover-path"]) : null;
  const mandatoryPaths = new Set([...route.primary, ...route.active, ...route.expansion]);
  const decisionScope = resolveDecisionScope(root, { ...(values["decision-task"] === undefined ? {} : { taskId: values["decision-task"] }), revision }, binding.context ?? undefined)
    ?? (options.provisionalScope ? resolveDecisionScope(root, {}, { workspace: options.provisionalScope.workspace, taskId: options.provisionalScope.taskId, revision: options.provisionalScope.taskRevision }) : null);
  const allCandidatePaths = options.workspaceCatalog || settings.questionIds.DL03.includes("context.metadata-relevance/1") || !pathScopes.length
    ? subject.paths() : inventory.relevant;
  const candidateInventory = allCandidatePaths;
  const requestedOriginals = [...(values["optional-path"] ?? []), ...(values.links ?? [])].map(safeSubjectPath);
  const catalog = contextMetadataCatalog(candidateInventory, task, [...pathScopes, ...requestedOriginals], scope.records.map(record => record.path), mandatoryPaths, options.historyHints);
  const projection = maintainContextProjection(subject, catalog.candidates.map(item => item.path), contextStateRoot(root),
    { purpose: task, exact: [...pathScopes, ...(values.links ?? []).map(safeSubjectPath)], deadlineAt: performance.now() + 1000 });
  const priorities = new Map(projection.priority.map((path, index) => [path, index]));
  catalog.candidates.sort((a, b) => Number(b.pinned) - Number(a.pinned) ||
    (priorities.get(a.path) ?? Infinity) - (priorities.get(b.path) ?? Infinity) || b.matches - a.matches || a.path.localeCompare(b.path));
  const familyRequest = digest({ purpose: task, revision: options.family?.revision ?? revision, configDigests,
    source: scope.subject_digest, originals: requestedOriginals });
  if (options.family?.automaticRefresh) options.family.step = nextContextExpansion(root, options.family.id, familyRequest);
  if (performance.now() >= timing.deadline) options = { ...options, signal: AbortSignal.abort("context-operation-deadline") };
  const metadataRuntime = new DecisionRuntime(settings, contextStateRoot(root), options);
  const inactiveSelection = !!options.family &&
    (!settings.questionIds.DL03.includes("context.metadata-relevance/1") || !settings.legacy.allowedDataClasses.includes("metadata") ||
      !(settings.allowedMetadataPaths ?? []).length || metadataRuntime.eligibility("DL03", "context.metadata-relevance/1").providerUse !== "eligible");
  if (options.family?.identity && !options.localOnly && !inactiveSelection &&
      !["opened", "existing"].includes(openContextFamily(contextStateRoot(root), options.family.identity))) options = { ...options, localOnly: true };
  const admission = options.family && !options.localOnly && !inactiveSelection ? beginContextSelection(root, options.family.id, options.family.step, familyRequest) : null;
  if (admission && !admission.paid && !admission.replay) options = { ...options, localOnly: true };
  let failureCursor: Parameters<typeof finishContextSelection>[4] = { version: 1, generation: projection.generation, batches: [] };
  try {
  const selectionDeadline = timing.beginSelection();
  const metadata = packet.ready && !options.localOnly ? await selectContextMetadata(subject, catalog, task,
    metadataRuntime, options.family?.scope ?? decisionScope, scope.subject_digest ?? digest(configDigests),
    options.family?.id ?? options.retrievalEvent ?? randomUUID(), options.signal, selectionDeadline, projection,
    options.family ? { id: options.family.id, revision: options.family.revision,
      ...(admission?.previous ? { previous: admission.previous } : {}), replayOnly: admission?.replay ?? false } : undefined) : null;
  timing.endSelection(metadata?.reason, options.signal,
    metadata?.reason === "deadline" && metadata.decisions.at(-1)?.failureStage === "budget");
  failureCursor = metadata?.cursor ?? failureCursor;
  const automatic = automaticContextCandidates(subject, candidateInventory, mandatoryPaths,
    ["**"], settings.legacy.maxCandidates,
    { purpose: task, exact: pathScopes, changed: scope.records.map(record => record.path), ordered: metadata?.order ?? catalog.candidates.map(item => item.path) });
  automatic.excluded.push(...catalog.excluded.slice(0, Math.max(0, 64 - automatic.excluded.length)));
  automatic.excludedCount += catalog.excludedCount;
  automatic.omittedCount += allCandidatePaths.length - candidateInventory.length;
  const declaredFiles = binding.context?.sourcePaths.filter(path => { try { return subject.source(path)?.file_type === "regular"; } catch { return false; } }) ?? [];
  const linkSeeds = new Set((values.links ?? []).map(safeSubjectPath));
  const expandedLinks = [...projection.links.flatMap(link => link.resolved ? linkSeeds.has(link.source) ? [link.resolved] : linkSeeds.has(link.resolved) ? [link.source] : [] : []),
    ...projection.catalogLinks.filter(link => linkSeeds.has(link.source)).map(link => link.resolved)];
  const explicitOptional = new Set([...(values["optional-path"] ?? []), ...(discovery?.paths ?? []), ...expandedLinks.slice(0, 32)].filter(path => !mandatoryPaths.has(path)));
  if (explicitOptional.size > 64) throw new Error("Too many explicit optional context inputs");
  const combinedPaths = [...new Set([...explicitOptional, ...declaredFiles.filter(path => !mandatoryPaths.has(path)), ...automatic.paths])];
  const optionalPaths = combinedPaths.slice(0, 64);
  for (const path of combinedPaths.slice(64)) { automatic.excluded.push({ path, reason: "candidate-limit" }); automatic.excludedCount++; }
  const candidates = readOptionalCandidates(subject, optionalPaths, explicitOptional, automatic, readCaptured);
  const admittedPaths = new Set(candidates.map(candidate => candidate.id));
  const excludedReasons = new Map(automatic.excluded.map(item => [item.path, item.reason]));
  automatic.priorityPreview = automatic.priorityPreview.map(item => {
    if (admittedPaths.has(item.path)) return explicitOptional.has(item.path) ? { ...item, disposition: "explicit-optional" }
      : declaredFiles.includes(item.path) ? { ...item, disposition: "task-declared" } : item;
    return item.disposition === "seeded" || item.disposition === "discovered"
      ? { ...item, disposition: excludedReasons.get(item.path) ?? "candidate-not-materialized" } : item;
  });
  const optionalBudget = Math.max(0, Math.min(packet.limits.expansion - packet.used.expansion, packet.limits.total - packet.used.total,
    options.maximumOptionalBytes ?? Infinity));
  let relevanceAdvice: ContextAdvice | null = null;
  const provider = routedDecisionProvider({ supplied: suppliedProvider, options, settings, metadata, profile, root, scope,
    decisionScope, configDigests, task, revision, onAdvice: advice => { relevanceAdvice = advice; } });
  // Invalid mandatory context prevents any optional provider call or source transmission.
  const optional = packet.ready && candidates.length && optionalBudget >= 2 ? await buildContextPacket({
    taskRevision: revision, purpose: task, required: [], optional: candidates, maximumBytes: optionalBudget,
    priorityIds: [...new Set([...explicitOptional, ...declaredFiles, ...catalog.candidates.filter(item => item.pinned).map(item => item.path)])].filter(path => admittedPaths.has(path)),
    sourceSpans: Object.fromEntries(candidates.flatMap(candidate => {
      const fact = projection.facts.get(candidate.id);
      return fact?.digest === candidate.sourceDigest ? [[candidate.id, fact.spans]] : [];
    })),
    optionalExcerptBytes: values["optional-excerpt-bytes"] !== undefined ? Number(values["optional-excerpt-bytes"]) : 2048,
  }, provider, options.localOnly ? { signal: AbortSignal.abort() } : options) : null;
  let workflowRecommendation = null;
  if (packet.ready && !options.promptEntry && !options.localOnly) {
    const manifestPath = values["workflow-candidates"] === undefined ? null : safeSubjectPath(values["workflow-candidates"]);
    const supplied = manifestPath ? resolveWorkflowCandidates(load(manifestPath), root, subject) : null;
    const workflowPaths = [...new Set([...(manifestPath ? [manifestPath] : []), ...(supplied?.sourcePaths ?? [])])];
    for (const path of workflowPaths) if (subject.source(path)?.file_type === "regular") {
      configDigests[path] = digest(readCaptured(path, 1024 * 1024).toString("base64"));
    }
    workflowRecommendation = await workflowAdvice(new DecisionRuntime(settings, contextStateRoot(root), options), supplied, decisionScope, {
      task, eventId: digest({ task, revision, supplied, source: scope.subject_digest }), policyDigest: digest(configDigests),
      environment: scope.mode, revision, subjectDigest: scope.subject_digest ?? digest(configDigests), sourcePaths: workflowPaths,
    });
  }
  const staleSources: string[] = [];
  // Re-read every captured candidate, including omitted sources, after optional advice returns.
  for (const path of [...capturedSubjectPaths, ...packet.entries.map(entry => entry.path)]) {
    try { subject.read(path, 1024 * 1024); } catch { staleSources.push(path); }
  }
  for (const [path, expected] of localSkillDigests) {
    try {
      const current = worktreeBytes(root, path, 16000);
      if (current.type !== "regular" || digest(current.bytes.toString("base64")) !== expected) staleSources.push(path);
    } catch { staleSources.push(path); }
  }
  const receiptId = randomUUID();
  if (options.family && options.family.step > 0) {
    const final = expansionIdentity(root, options.family.id, options.session);
    if (digest(final.scope) !== digest(options.family.scope) || final.revision !== options.family.revision)
      throw new ContextRouteError("entry-task-changed", "The task changed while preparing context; refresh against the current binding.");
  }
  const identity = { revision, taskDigest: digest(task), configDigests, routingPaths, route: route.selected?.id ?? null,
    source: { mode: scope.mode, base: scope.base_ref, changes: scope.subject_digest },
    context: packet.entries.map(({ content, ...entry }) => entry),
    skills: packet.skills?.entries.map(({ content, reasons, ...entry }) => entry) ?? [],
    optionalSources: candidates.map(({ excerpt, ...entry }) => entry),
    localSkillSources: Object.fromEntries(localSkillDigests) };
  const selection = { binding: taskBindingReceipt(binding), candidateCount: candidates.length, inventoryUnavailable: inventory.unavailable,
    reason: !packet.ready ? "required-context-unavailable" : !candidates.length ? automatic.excludedCount ? "no-permitted-candidates" : "no-optional-candidates"
      : optionalBudget < 2 ? "optional-budget-empty" : optional?.reason ?? "selection-unavailable",
    optionalDelivery: optional ? optional.entries.length ? "delivered" : "none" : "not-attempted",
    optionalClippedPaths: optional?.entries.filter(entry => entry.sourceRange).map(entry => entry.id) ?? [],
    optionalOmissionReasons: optional?.omissionReasons ?? {},
    automatic: { ...automatic, prefilter: "delivery after complete-inventory JEV assessment or explicit partial/fallback; source capture remains bounded" } };
  // Full decisions already have individual receipts. A normal command returns bounded previews,
  // never the entire index it was meant to keep out of the coding model's context.
  const metadataSummary = metadataReceiptPreview(metadata);
  const familyCompleted = options.family && admission?.paid ? finishContextSelection(root, options.family.id, options.family.step, familyRequest,
    metadata?.cursor ?? { version: 1, generation: projection.generation, batches: [] }) : null;
  const expansion = options.family ? { entry: options.family.id, step: options.family.step, status: admission?.status ?? "local-only", completed: familyCompleted,
    transitionId: options.family.transitionId ?? null,
    nextStep: options.family.step < 2 ? options.family.step + 1 : null, sharedAllowance: true, originalReadsAvailable: true } : null;
  const receipt = { version: 1, receiptId, createdAt: new Date().toISOString(), ...identity, selection, expansion,
    timing: timing.snapshot(metadata?.providerCallMs ?? 0, metadata?.sourceIndex.elapsedMs ?? 0),
    projection: projectionReceiptPreview(projection, admittedPaths),
    inputDigest: digest(identity), ready: packet.ready && !staleSources.length, blockers: packet.blockers,
    omissions: packet.omissions, skillOmissions: packet.skills?.omissions ?? [],
    optional: optional ? { selected: optional.entries.map(entry => entry.id), omitted: optional.omitted,
      omissionReasons: optional.omissionReasons,
      decision: optional.decision, measurement: optional.measurement, reason: optional.reason } : null,
    relevanceAdvice, metadata: metadataSummary, workflowAdvice: workflowRecommendation, discovery, staleSources, outcome: staleSources.length ? "refused-stale-source" : packet.ready ? "delivered" : "blocked" };
  let receiptPersisted = true;
  try { durableJson(join(contextStateRoot(root), "routes", `${receiptId}.json`), receipt); }
  catch (error) { if (!options.localOnly || !options.promptEntry) throw error; receiptPersisted = false; }
  // The route receipt owns per-path diagnostics. Repeating its preview in every immutable
  // exposure episode would exhaust the bounded outcome reader during an adoption study.
  const { priorityPreview: _preview, ...automaticExposure } = selection.automatic;
  if (receiptPersisted) recordEntryExposure(contextStateRoot(root), { caller: options.promptEntry ? "prompt-context-route" : "context-route", entryKind: "context-delivery", scope: decisionScope,
    native: { receiptId, inputDigest: receipt.inputDigest }, exposure: { ...selection, automatic: automaticExposure, reached: true,
      delivered: receipt.ready, used: null, acceptedOutcome: "unknown", totalModelTokens: null, outsideEntryActivity: "unknown" },
    decisions: [(relevanceAdvice as ContextAdvice | null)?.decision?.receiptId, optional?.decision?.receiptId,
      ...(metadata?.decisions.map(item => item.receiptId) ?? [])].filter((id): id is string => typeof id === "string") });
  if (staleSources.length) throw new Error("Context sources changed while preparing the routed packet");
  return { ...packet, route, routingPaths, receiptId, receiptPersisted, inputDigest: receipt.inputDigest, revision, source: identity.source,
    timing: receipt.timing,
    projection: receipt.projection,
    expansion: expansion ? { ...expansion, argv: expansion.nextStep ? ["project-governance", "context-route", "--entry", expansion.entry,
      "--expansion", String(expansion.nextStep), "--task", task, "--revision", revision] : null } : null,
    optional, metadata: metadataSummary, relevanceAdvice: relevanceAdvice as ContextAdvice | null, workflowAdvice: workflowRecommendation,
    optionalBudget, optionalOmitted: optional?.omitted ?? optionalPaths, discovery, selection };
  } catch (error) {
    // A failed delivery must not strand the remaining allowance or erase already-paid batches.
    if (options.family && admission?.paid) finishContextSelection(root, options.family.id, options.family.step, familyRequest, failureCursor);
    throw error;
  }
}
