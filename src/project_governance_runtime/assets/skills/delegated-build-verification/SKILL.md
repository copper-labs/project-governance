---
id: skill.delegated-build-verification
title: Delegated Build Verification
stage: Review
provenance: package-default
---

# Delegated Build Verification

Run mechanical checks against one identified integrated snapshot.

## Trigger

Dormant in Version 1. Use only when a later governed release explicitly enables a build-verifier
worker brief.

## Required Reads

- The supplied compact worker brief
- Only the selected materialized context supplied beside the brief
- The installed role contract

## Workflow

1. Confirm the snapshot, commands, build-output allowance, budgets, and stop conditions.
2. Read only packet materialized refs and run only assigned checks. Do not call provider or graph
   tools.
3. Do not repair governed source or delegate again.
4. Return the shared result envelope, echoing the contract version, provider ids, packet digest,
   and verified snapshot.

## Validation

Capture command, exit code, and focused diagnostics for every assigned check.

## Evidence

Return the verified snapshot, command results, generated artifacts, blockers, and confidence within
the result budget.
