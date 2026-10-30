// Telemetry may be partial or malformed. Do not let an invalid child hide the population.
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const count = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const safeLabel = (raw: unknown) => typeof raw === "string" && /^[a-z][a-z0-9-]{0,79}$/u.test(raw) ? raw : "unknown";
const increment = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1; };
const tokenFields = ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteInputTokens", "reasoningTokens", "freshInputTokens"] as const;
function usageTotals(responses: Array<Record<string, unknown> | null>) {
  const fields = Object.fromEntries(tokenFields.map(key => [key, { known: null as number | null, missing: 0 }])) as Record<typeof tokenFields[number], { known: number | null; missing: number }>;
  for (const raw of responses) {
    const value = raw ?? {}, input = count(value.inputTokens), cached = count(value.cachedInputTokens);
    for (const field of tokenFields) {
      const measured = field === "freshInputTokens" ? input !== null && cached !== null && cached <= input ? input - cached : null : count(value[field]);
      if (measured === null) fields[field].missing++; else fields[field].known = (fields[field].known ?? 0) + measured;
    }
  }
  return { responses: responses.length, fields };
}
/** Report observed coverage, never turn missing reads, usage or outcomes into successful work. */
export function contextEffectiveness(records: Array<{ collection: string; value: Record<string, unknown> }>, partial: boolean) {
  const entries = new Map(records.filter(r => r.collection === "prompt-entries" && validId(r.value.entryId)).map(r => [String(r.value.entryId), r.value]));
  const linked = { route: new Set<string>(), usage: new Set<string>(), expansion: new Set<string>(), outcome: new Set<string>(), native: new Set<string>(), local: new Set<string>(), semantic: new Set<string>() };
  const byHost: Record<string, number> = {}, modes: Record<string, number> = {}, effectiveModes: Record<string, number> = {};
  const collectionStates: Record<string, number> = {}, collectionGaps: Record<string, number> = {}, statuses: Record<string, number> = {};
  const responses = new Map<string, { entry: string | null; usage: Record<string, unknown> | null }>();
  const outcomes = new Map<string, Set<string>>();
  let orphanObservations = 0, routes = 0, unlinkedRoutes = 0, observedRoutes = 0, attemptedRoutes = 0, unknownAttemptedRoutes = 0;
  for (const entry of entries.values()) { increment(byHost, safeLabel(entry.provider)); increment(statuses, safeLabel(entry.status)); }
  for (const { collection, value: item } of records) {
    if (collection === "routes") {
      routes++;
      const execution = object(item.execution), retrieval = object(object(item.selection).retrieval);
      increment(modes, safeLabel(retrieval.requested)); increment(effectiveModes, safeLabel(retrieval.effective));
      if (retrieval.providerAttempted === true) attemptedRoutes++; else if (retrieval.providerAttempted !== false) unknownAttemptedRoutes++;
      const id = validId(execution.entryId) ? execution.entryId : typeof item.receiptId === "string" ? [...entries].find(([, e]) => e.routeReceiptId === item.receiptId)?.[0] : undefined;
      if (id && entries.has(id)) {
        linked.route.add(id);
        if (retrieval.trigger === "native-prompt") linked.native.add(id);
        else if (retrieval.requested === "local" || retrieval.requested === "semantic") linked[retrieval.requested].add(id);
      } else unlinkedRoutes++;
      if (object(execution.promptLink).status === "observed") observedRoutes++;
    }
    if (collection !== "context-observations") continue;
    if (item.kind === "usage-collection") {
      const collected = object(item.collection), deferred = object(item.deferred);
      increment(collectionStates, safeLabel(collected.state ?? item.status ?? item.state));
      for (const key of ["invalid", "unreadableUsageLines", "storeProjectionFailures", "ambiguous", "unlinkedTurns", "ambiguousTurns", "unavailableRanges", "omittedRanges", "skippedCurrentResponses"]) {
        const measured = count(item[key] ?? collected[key] ?? deferred[key]);
        if (measured !== null) collectionGaps[key] = (collectionGaps[key] ?? 0) + measured;
      }
      continue;
    }
    if (!["usage", "expansion", "outcome"].includes(String(item.kind))) continue;
    const id = item.entryId, kind = item.kind as "usage" | "expansion" | "outcome", value = object(item.usage);
    const valid = kind === "usage" ? typeof value.session === "string" && value.session.length > 0 && typeof value.responseId === "string" && value.responseId.length > 0
      : kind === "outcome" ? ["accepted", "reopened"].includes(String(item.disposition)) && typeof item.evidence === "string" && item.evidence.length > 0
      : typeof item.path === "string" && item.path.length > 0;
    const entry = valid && validId(id) && entries.has(id) ? id : null;
    if (!entry) orphanObservations++;
    if (kind === "usage" && valid) {
      const key = JSON.stringify([value.session, value.responseId]), prior = responses.get(key);
      if (prior && (prior.entry !== entry || JSON.stringify(prior.usage) !== JSON.stringify(value))) {
        responses.set(key, { entry: prior.entry === entry ? entry : null, usage: null });
        increment(collectionGaps, "conflictingResponses");
      } else if (!prior) responses.set(key, { entry, usage: value });
    } else if (entry && kind !== "usage") {
      linked[kind].add(entry);
      if (kind === "outcome") { const dispositions = outcomes.get(entry) ?? new Set<string>(); dispositions.add(String(item.disposition)); outcomes.set(entry, dispositions); }
    }
  }
  for (const { entry, usage } of responses.values()) if (entry && usage) linked.usage.add(entry);
  const nativeUsage = usageTotals([...responses.values()].filter(r => r.entry !== null).map(r => r.usage));
  const orphanUsage = usageTotals([...responses.values()].filter(r => r.entry === null).map(r => r.usage));
  const outcomeStates = [...outcomes.values()];
  return { population: "inspected immutable receipts only; not all host requests", partial,
    entries: entries.size, byHost, statuses, routes, requestedModes: modes, effectiveModes, attemptedRoutes, unknownAttemptedRoutes,
    withLinkedRoute: linked.route.size, withNativeRoute: linked.native.size, withExplicitLocalRoute: linked.local.size, withExplicitSemanticRoute: linked.semantic.size,
    withNativeUsage: linked.usage.size, withAdditionalReadObservations: linked.expansion.size,
    withOutcomeEvidence: linked.outcome.size, unknownUsageEntries: entries.size - linked.usage.size,
    unknownReadEntries: entries.size - linked.expansion.size, unknownOutcomeEntries: entries.size - linked.outcome.size,
    unlinkedRoutes, observedRoutes, orphanObservations, collectionStates, collectionGaps,
    outcomeObservations: { accepted: outcomeStates.filter(s => s.size === 1 && s.has("accepted")).length,
      reopened: outcomeStates.filter(s => s.size === 1 && s.has("reopened")).length, multipleDispositions: outcomeStates.filter(s => s.size > 1).length,
      provenance: "distinct linked entries; multiple dispositions are not resolved into acceptance; host-reported references, not verified acceptance" },
    nativeUsage: { ...nativeUsage, partial: partial || Object.values(collectionGaps).some(n => n > 0) || entries.size !== linked.usage.size || Object.values(nativeUsage.fields).some(v => v.missing > 0),
      accounting: "linked response subtotals only; cached input is a subset of input, reasoning is not additional output" },
    observedUsage: { ...usageTotals([...responses.values()].map(r => r.usage)), accounting: "all inspected response observations; not the linked entry denominator" },
    orphanUsage: { ...orphanUsage, accounting: "outside inspected entry population; excluded from linked totals" },
    hostConsumption: "unknown", bypassCoverage: "unknown-without-host-population", unsupportedHostUsage: "unobserved",
    economicBenefit: "requires matched accepted tasks and a declared price snapshot" };
}
