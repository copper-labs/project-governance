---
name: sveltekit-performance-observability
description: Review or improve SvelteKit performance and observability across load waterfalls, bundle size, hydration, server latency, database query behavior, caching, logs, metrics, traces, and production failure evidence. Use when diagnosing slow pages, large bundles, expensive queries, flaky runtime behavior, or missing operational visibility.
---

# SvelteKit Performance Observability

## Trigger

Use this skill when a SvelteKit task touches performance, load waterfalls, bundle size, hydration,
server latency, database query behavior, caching, telemetry, logs, metrics, traces, alerts, or
production failure evidence.

## Required Reads

- `AGENTS.md`
- `docs/governance/validation-strategy.md`
- target profile performance budgets, observability stack, deployment runtime, and validation packs
- nearest route/load/action code, database queries, telemetry/logging helpers, and performance tests
- `sveltekit-data-loading`
- `sveltekit-drizzle-postgres` or ORM-specific skill when database behavior is involved
- `sveltekit-deployment-adapters` when runtime or adapter behavior could affect performance

## Workflow

1. Define the performance question in user-observable terms: slow route, heavy interaction, delayed
   submit, cold start, large bundle, repeated query, missing alert, or invisible failure.
2. Gather current evidence before changing code: timings, logs, traces, query counts, bundle output,
   browser performance, CI failures, or production incident notes.
3. Check load waterfalls. Avoid serial server calls when independent reads can run safely in
   parallel, but preserve authorization and transaction boundaries.
4. Check database behavior: missing indexes, unbounded lists, N+1 queries, broad selects, repeated
   tenant checks, and transaction contention.
5. Check bundle/hydration behavior: unnecessary client imports, server-only leakage, large UI
   libraries, heavy charts/editors, and route-level splitting.
6. Keep caching explicit. Name cache owner, invalidation event, privacy scope, max age, and stale
   behavior before adding caches.
7. Add observability where it changes operations: structured logs, correlation ids, duration
   metrics, error counters, job ids, tenant-safe metadata, and alertable failure states.
8. Avoid logging secrets, tokens, private payloads, or broad tenant data.
9. Prove improvement with before/after evidence when practical.

## Validation

Run impacted performance and observability validation packs. Common checks include:

- TypeScript/Svelte check
- lint and format
- affected unit/integration tests
- browser smoke or Playwright timing evidence for critical flows
- bundle analysis or production build size check
- query tests, explain plans, or query-count assertions for critical data paths
- telemetry/logging tests or manual trace proof where configured

## Evidence

Report baseline evidence, bottleneck hypothesis, changes made, before/after measurements when
available, cache and invalidation choices, observability fields added, commands run, and residual
performance risk.
