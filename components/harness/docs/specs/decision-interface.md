---
id: spec.harness.decision-interface
title: Optional Decision Interface
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Optional Decision Interface

## Status

Deferred experiment. No provider dependency, network call, classifier or decision catalog is
required or installed by the core. This is the current architectural boundary, not an assertion
that a future model adapter has been implemented.

## Admission

First establish the provider-free baseline and identify an expensive semantic judgment. Exact
facts, arithmetic, hashes, permissions, input applicability rules and release gates remain code-owned.
JEV is a learned decision model, not deterministic execution.

A future typed question names its version, bounded evidence/candidates, answer schema, provider
identity, deadline, measurement and explicit unknown/fallback disposition. The model may suggest;
code and the host retain authority. Provider-specific Choice, Score and Noul semantics must not be
collapsed into one supposedly calibrated probability of safe action.

## Evaluation

Compare deterministic matching, the existing host and one optional model on held-out failure/task
episodes. Include packet creation, provider latency/cost, fallback, repeated host context, omission
and rework. Start in shadow mode; shadow quality is not realized savings. Pin question/provider
versions, retain evidence and test disabling the adapter. Do not promote a confidence threshold
without target-workload calibration.

## Removal

Disabling the model leaves every core command and authority boundary intact. No gate, migration,
resume, recovery or evidence query may require model availability.

## Placement in the development flow

A **decision adapter** answers one small semantic question. JEV is one possible implementation;
deterministic rules remain the first choice and Codex remains the fallback for open reasoning.
The adapter is an internal governance module interface, not a separately supported model-routing product.

`structured facts → deterministic match → optional bounded semantic question → validated suggestion → owner decision`

| Candidate | Example answer | Where it helps | Timing |
| --- | --- | --- | --- |
| Failure triage | Infrastructure / product assertion / insufficient evidence | Read a short unresolved diagnostic rather than repeatedly ingesting a full log | First candidate after measured provider-free pilot |
| Context ranking | Ordered subset of supplied evidence IDs | Prioritize relevant history within a byte budget | Only after simple retrieval shows misses |
| Task-category advice | One existing governance category or unknown | Help the host choose policy for a new task | Later; no live parent switching |

Known error codes, hashes, changed paths and required-check selection stay deterministic. The adapter
cannot decide to skip a pre-commit/CI/device gate, assert that a cached verdict is valid, mark cleanup
complete, authorize a retry or accept a task. A product failure labelled infrastructure remains a
recorded failure; classification cannot erase it.

## Proposed provider-neutral contract

Request: question ID/version, purpose, bounded typed state/evidence references, allowed candidates
(including unknown), response schema, evidence digest, deadline, data-sharing policy and total cost
budget. Response: answer or abstention, referenced evidence IDs, provider/model version, native usage,
latency and raw provider-specific uncertainty fields. Reject malformed answers, invented candidate IDs,
expired responses and results for changed inputs. No generated executable commands.

Initial experiment cap: one eligible request per unresolved failure episode, at most 8 KiB evidence,
5-second deadline and no automatic retry cascade. These are tunable experimental bounds, not JEV
capability claims. Oversize/incomplete evidence or provider outage returns unknown and uses the existing
Codex path. Preserve decisive late-context facts; never silently truncate to meet a provider limit.
Credentials and permission to send project data are explicit; enabling an adapter is not blanket export
permission. Local/no-model operation remains complete.

TypeSafe documents Choice, Score and Noul as different structured question primitives. The adapter
maps only the selected question's semantics; reported confidence is not a universal probability that
an action is safe. [TypeSafe primitives](https://docs.typesafe.ai/primitives)

Start with failure episodes split into development and held-out groups, keeping related retries
in one group. Compare deterministic parsing, current Codex handling and the adapter including packet
preparation, escalation, total tokens/time and erroneous routing. Shadow mode establishes quality but
saves no calls if Codex still repeats the work. Promotion requires that a measured slice actually
replaces unnecessary host work without hiding failures or weakening required proof. The first shipped
harness assumes **zero benefit from JEV** and requires no JEV implementation.
