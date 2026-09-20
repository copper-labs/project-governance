---
id: spec.harness.failure-triage
title: Failure Triage
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Failure Triage

## Current behavior

The existing executor returns native case outcomes, input validity, cleanup and full-log pointers.
The harness preserves the structured receipt and exposes bounded result/artifact access. It does
not infer a cause or execute a remedy. Infrastructure gaps, interruption and unverified inputs
remain unconfirmed rather than becoming a failed product assertion.

## Candidate experiment

Normalize known runner errors using deterministic project-owned parsers. If the remaining semantic
triage is measurably expensive, compare short attributable snippets plus an unknown option using
the optional decision interface. Do not send every full build log to a model by default.

A predicted cause, proposed repair and observed retry outcome are separate records. A passing retry
does not establish why the first run failed. Cleanup, reset, deletion and retry require their normal
owner authority; a classification supplies none.

## Measurement and promotion

Split held-out data by failure episode so related retries do not leak across sets. Measure diagnostic
correctness where establishable, coverage, fallback, total cost and time to actionable result.
Include delayed defects and omitted evidence. Keep the classifier absent if deterministic parsing
and compact receipts remove the cost.

## Planned first semantic experiment

The [decision interface](decision-interface.md#placement-in-the-development-flow) defines a bounded,
provider-neutral failure-triage request. JEV is one candidate after deterministic result normalization
and the Codex pilot show a remaining cost. It cannot alter the original check verdict or authorize
remediation. No semantic adapter is part of the first qualified release.
