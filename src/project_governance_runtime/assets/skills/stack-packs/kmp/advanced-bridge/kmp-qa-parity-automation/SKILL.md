---
name: kmp-qa-parity-automation
description: Use when setting up or reviewing automated QA for a KMP product across Android, iOS, React Native, Flutter, web, or other hosts. Establishes stable selector parity, black-box E2E first, common contract tests, CI split, artifacts, and host-proof expectations.
---

# KMP QA Parity Automation

## Trigger

Use this skill for KMP UI/E2E automation, host parity proof, selector conventions, Maestro/Playwright-style flows, CI test matrix design, smoke/regression split, or public behavior proof across multiple hosts.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles and validation packs for all affected hosts
- existing test selector policy, E2E flows, CI workflows, and artifact paths
- common KMP tests and host public-surface tests for the touched behavior

## Workflow

1. Use shared KMP tests as the contract layer for reducers, state machines, command legality, projection semantics, and cancellation.
2. Define one stable selector name per interactive element and map it idiomatically per host, such as Compose test tags, iOS accessibility identifiers, React Native test IDs, Flutter semantics, and web data attributes.
3. Prefer black-box UI automation for public behavior, with host-specific gray-box tools only for gaps that black-box flows cannot reliably cover.
4. Start flows from deterministic state: reset storage, control permissions, set animation policy, and seed required fixtures deliberately.
5. Keep shared flow fragments compositional, and isolate unavoidable platform variance in short host-specific steps.
6. Split CI by cost and platform: fast shared/build/static checks first, host smoke checks on PR, broader platform/device regression on main or release lanes.
7. Require proof that public host APIs cross into shared runtime behavior, not just that UI changed locally.
8. Archive artifacts that help diagnose bridge parity: logs, screenshots, videos, envelope traces, drop diagnostics, and support bundles where available.

## Validation

Run common KMP tests, changed-host unit tests, smoke E2E flows, and deeper host/platform tests required by the target profile. For web-heavy hosts, add browser automation when browser behavior is part of the claim.

## Evidence

Report the host matrix, selector mapping, deterministic setup, flow names, CI gate mapping, artifacts, skipped hosts with reasons, and parity gaps that need a future slice.
