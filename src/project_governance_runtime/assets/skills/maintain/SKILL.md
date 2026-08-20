---
id: skill.maintain
title: Maintain
stage: Maintain
provenance: package-default
---

# Maintain

Improve a proven governance problem without adding administration around it.

## Trigger

Use this when a check is inaccurate, slow, confusing, or no longer needed.

## Target Inputs

When present, read the target's `AGENTS.md`, relevant governance configuration, and the local
telemetry status. These are optional target inputs.

## Workflow

1. Identify the affected check, actual failure mode, owner, and smallest correction.
2. Choose the response from the ownership boundary:

   | Condition | Response |
   | --- | --- |
   | Target-owned mechanical defect and the active task authorizes writes | Repair it locally. |
   | Read-only task | Diagnose it and offer the narrow correction. |
   | Policy weakening, ownership change, or ambiguous repair | Explain the tradeoff and propose the correction before applying it. |
   | Runtime-wheel defect | Report it and offer an upstream report; do not copy, patch, or locate the source runtime. |

3. Change one component at a time and run its focused test.
4. Run one directly affected integration seam. Do not repeat unrelated passing packs.
5. Remove obsolete code and references rather than leaving a fallback or parallel policy.
6. Use local telemetry only to spot repeated scopes, broad runs, or slow packs; it never authorizes
   a policy change by itself. Account separately for direct commands and native-host launches that
   the status output explicitly excludes.

## Validation

Run the changed component's focused test and one impacted closeout check.

## Evidence

Report the problem, correction, focused proof, closeout result, and any remaining risk.
