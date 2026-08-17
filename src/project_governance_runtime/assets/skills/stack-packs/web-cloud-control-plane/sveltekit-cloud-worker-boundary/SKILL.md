---
name: sveltekit-cloud-worker-boundary
description: Design or review boundaries between a SvelteKit control plane and backend services, workers, queues, schedulers, publishing pipelines, signing, encryption, entitlement, license enforcement, activation, import planning, and audit systems. Use when privileged or long-running work risks being placed inside web request handlers.
---

# SvelteKit Cloud Worker Boundary

## Trigger

Use this skill when SvelteKit code touches or proposes ownership of long-running jobs, queues,
workers, schedulers, publishing, signing, encryption, entitlement, license enforcement, activation,
import planning, bulk transforms, audit ledgers, or privileged backend workflows.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile service, worker, queue, audit, security, and deployment settings
- nearest service contracts, job models, queue handlers, worker docs, and audit requirements
- `sveltekit-server-boundaries-security`
- `sveltekit-data-loading` or `sveltekit-form-actions-zod` when web routes initiate the workflow

## Workflow

1. Classify the requested behavior as request/response UI work, short trusted server action,
   long-running job, privileged pipeline, scheduled task, event consumer, or external service call.
2. Keep SvelteKit responsible for user interaction, validation, session context, workflow initiation,
   status display, and safe calls to backend contracts.
3. Move durable or privileged work outside SvelteKit request handlers when it involves retries,
   progress tracking, signing, encryption, entitlement, license enforcement, activation, audit
   finality, import planning, bulk transforms, webhooks, or external side effects.
4. Require an explicit job or command record for async workflows. Include status, owner, tenant,
   inputs, idempotency key, timestamps, errors, retries, and result references as appropriate.
5. Make idempotency and retry semantics explicit before queueing or calling external systems.
6. Keep audit writes authoritative in the system that owns audit durability. The web app may display
   audit state but should not fake finality.
7. Do not let UI-only authorization substitute for backend entitlement or license checks.
8. Define progress and failure surfaces for users: accepted, queued, running, blocked, failed,
   canceled, complete, and expired where relevant.
9. Add tests around web initiation, invalid input, unauthorized initiation, idempotent retry, status
   display, and worker/service contract shape.

## Validation

Run impacted architecture, security, and integration validation packs. Common checks include:

- architecture boundary review
- TypeScript/Svelte check and lint
- contract tests between SvelteKit and worker/service APIs
- queue/job model tests
- authorization, tenant, entitlement, and idempotency tests
- audit/logging checks
- deployment checks for worker/service configuration when touched

## Evidence

Report ownership classification, what remains in SvelteKit, what moves to worker/service ownership,
job or command contract changes, idempotency/retry model, audit and entitlement boundaries,
validation commands, and any backend contract still missing.
