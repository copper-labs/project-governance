---
name: sveltekit-testing-playwright-vitest
description: Design or review SvelteKit test coverage with Vitest, component tests, server/action/load integration tests, Playwright browser flows, fixtures, auth state, database isolation, and impact-aware validation. Use when adding or changing tests for SvelteKit routes, components, forms, data loading, server code, or critical user workflows.
---

# SvelteKit Testing Playwright Vitest

## Trigger

Use this skill when a task adds, changes, reviews, or triages tests for SvelteKit components,
routes, server load functions, form actions, data access, auth gates, browser flows, or CI web
validation.

## Required Reads

- `AGENTS.md`
- `docs/governance/validation-strategy.md`
- `docs/governance/hook-and-check-taxonomy.md`
- target profile validation packs, package scripts, CI rules, and browser matrix
- nearest test helpers, fixtures, mocks, database setup, and existing route/component tests
- relevant web stack skill for the behavior under test
- current official Svelte/SvelteKit testing and Playwright docs when APIs or fixtures are uncertain

## Workflow

1. Start from user-observable behavior and risk. Pick the smallest test level that proves the
   behavior without hiding integration failures.
2. Use unit tests for pure helpers, selectors, schemas, small state machines, and deterministic
   component behavior.
3. Use server/action/load integration tests for auth, validation, redirects, errors, data access,
   transactions, and tenant scope.
4. Use Playwright for critical workflows, route transitions, forms, auth gates, accessibility smoke,
   and browser-only behavior.
5. Keep fixtures deterministic, readable, and target-safe. Do not use production secrets or live
   third-party services unless the target profile has an explicit smoke lane.
6. Isolate database state with transactions, test schemas, generated fixtures, or reset hooks as
   the target supports.
7. Prefer role/label/user-facing selectors over brittle DOM structure selectors.
8. Test negative paths: unauthorized, invalid input, cross-tenant access, missing records, conflict,
   server failure, and empty state when relevant.
9. Keep CI impact-aware. Run narrow tests locally, then broader pack checks for shared behavior.

## Validation

Run the target profile's testing packs. Common checks include:

- unit/component test command
- server/action/load integration tests
- Playwright smoke or changed-flow suite
- lint and typecheck
- database test setup and teardown checks
- flaky-test retry analysis only as diagnosis, not as proof of correctness

## Evidence

Report the behavior covered, test level chosen, fixtures used, negative paths tested, browser/device
coverage, commands run, flaky or skipped tests, and residual risk if only partial validation was
practical.
