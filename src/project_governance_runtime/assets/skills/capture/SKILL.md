---
id: skill.capture
title: Capture
stage: Capture
provenance: package-default
---

# Capture

Record a lesson only when it will change a future decision or prevent a repeat failure.

## Trigger

Use this at closeout when the work exposed a reusable trap, a missing selector, or a policy decision
that should be durable.

## Target Inputs

When present, use the target's `AGENTS.md`, documentation index, and chosen lessons or decision
location. These are target-owned; no package capture schema or evidence file is required.

## Workflow

1. State the condition, consequence, and durable correction in a few sentences.
2. Keep project facts and project-owned lessons in the target repository.
3. For a runtime-owned problem, report the evidence and offer to prepare upstream feedback. Do not
   create a report, search for a source checkout, or take upstream action by default.
4. Only after an explicit operator request, prepare one redacted report at
   `.governance/runtime/feedback/<report>.md` unless the operator selects another location. Include:
   - runtime version and affected capability;
   - expected and observed behavior;
   - a generic reproduction;
   - focused evidence and any telemetry scope fingerprint; and
   - the suspected owner.
5. Exclude project identities, local paths, credentials, proprietary source, and raw logs. A report
   placed in a tracked location must satisfy that target location's validation contract.
6. Edit a Project Governance source checkout only when the operator explicitly requests source work
   and identifies or selects that checkout. Follow its repository instructions.
7. Do not create a record for routine success or duplicate an existing instruction.

## Validation

Run the target's documentation check only when a tracked target document changed. The default
ignored feedback location requires no additional validation pack.

## Evidence

Report the optional target document or explicitly requested feedback file, or explain why no
durable lesson was needed.
