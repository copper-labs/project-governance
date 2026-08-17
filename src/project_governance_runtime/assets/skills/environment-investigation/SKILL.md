---
name: environment-investigation
description: Use a bounded, read-only environment briefing without crossing a target's mutation boundary.
metadata:
  id: skill.environment-investigation
  title: Environment Investigation
  stage: Work
  provenance: package-default
---

# Environment Investigation

Understand an environment with the smallest safe evidence set.

## Trigger

Use this for read-only environment orientation, incident diagnosis, or a provider-specific
investigation that the target has explicitly authorized.

## Target Inputs

When present, read the target's environment runbook, profile, supplied briefing, and incident or
work item. They are target-owned inputs; this package has no provider adapters or credentials.

## Workflow

1. Confirm the exact environment, component, expected principal, authorized operation, and evidence
   freshness.
2. Use the smallest bounded read that can answer the question. Treat missing, stale, partial, and
   inaccessible evidence explicitly.
3. Stop before mutation, recovery, destructive action, or credential handling unless the target
   separately authorizes that operation.
4. Record the observation, uncertainty, and next authorized action in the target's normal work
   record when one exists.

## Validation

Run only the changed target contract or fixture tests. Do not run broad governance checks for a
read-only investigation.

## Evidence

Report the environment reference, operation class, evidence freshness, result, uncertainty, and
next authorized action.
