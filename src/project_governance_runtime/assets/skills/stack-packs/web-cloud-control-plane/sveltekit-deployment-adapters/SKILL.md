---
name: sveltekit-deployment-adapters
description: Select, implement, or review SvelteKit deployment adapters, runtime constraints, environment handling, serverless/edge/node boundaries, build output, platform routing, and deployment proof. Use when changing svelte.config, adapters, platform deployment settings, environment variables, SSR/prerender behavior, or runtime-specific code.
---

# SvelteKit Deployment Adapters

## Trigger

Use this skill when a change touches SvelteKit adapters, `svelte.config`, deployment runtime,
serverless/edge/node behavior, environment variables, SSR, prerender, platform routing, build
output, or deployment proof.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile deployment, runtime, environment, CI, and release settings
- current adapter config, build scripts, deployment docs, platform env setup, and smoke tests
- `sveltekit-server-boundaries-security`
- `sveltekit-cloud-worker-boundary` when deployment touches jobs, queues, or privileged pipelines
- current official SvelteKit adapter docs and target platform docs when runtime behavior is uncertain

## Workflow

1. Identify the runtime target: Node server, serverless function, edge runtime, static/prerender,
   container, or platform-specific adapter.
2. Confirm the adapter supports required features: SSR, streaming, cookies, headers, file uploads,
   Web APIs, database driver, long request limits, image/assets behavior, and private env access.
3. Keep environment variables classified as public, private, build-time, runtime, preview, staging,
   or production. Do not move private values into public prefixes.
4. Review SSR/prerender decisions route by route. Do not prerender tenant, auth, private, or
   frequently changing data unless a safe cache strategy exists.
5. Keep platform-specific code isolated behind runtime adapters or server-only modules.
6. Validate database connectivity and connection pooling for the runtime model. Serverless and edge
   deployments often need different client behavior than long-lived Node processes.
7. Keep deployment smoke tests focused on real risk: boot, auth/session, critical route, form submit,
   DB read/write, webhook/API endpoint if applicable, and static asset delivery.
8. Document any platform limits that affect product design, especially request timeouts, body size,
   cold starts, region choice, queue integration, and logging.

## Validation

Run deployment validation packs. Common checks include:

- clean install and production build
- Svelte/TypeScript check, lint, and format
- adapter build output inspection
- preview or local production server smoke
- environment variable classification checks
- platform-specific smoke for changed deployment surfaces
- database connectivity and migration readiness checks

## Evidence

Report adapter/runtime choice, SSR/prerender changes, env classification, platform limits considered,
build and smoke commands, database/runtime proof, and any deployment settings requiring operator
configuration.
