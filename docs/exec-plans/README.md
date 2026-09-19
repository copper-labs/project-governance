---
id: plan.harness.master
title: Decision-First Harness Master Plan
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Five sequenced experiments that find the real cost before building for it, plus one independent release-preparation track.
---

# Decision-First Harness Master Plan

Rebuilt against the [architecture review](../reviews/2026-09-19-architecture-review.md); see
[the reconciliation](../reviews/2026-09-19-reconciliation-architecture.md). The previous six-phase
plan is in git history.

All steps are governed by [the umbrella contract](../specs/harness-core.md), whose fixed decisions
and invariants no step may revisit.

## Final State

A harness that keeps a portable record of what the operator wants, executes within declared
authority, and produces evidence of what happened. A cheap decision model may improve it. It does
not define it.

**Non-goals:** a front door of our own, a desktop application, a substrate migration, a general
plugin engine, and any change to what the governance runtime owns.

## Delivery

- Delivery: local-only

## What Changed, And Why

The earlier plan assumed classification was the bottleneck and built an evaluation for it first,
which presumed its own conclusion. This sequence baselines one concrete scenario, proves that
scenario end to end without a model, and only then tests whether a decision model improves
**accepted work**.

The scenario is chosen because it exercises everything at once: context, authority, execution,
evidence and continuity.

A negative result at step 3 removes one feature and leaves a working tool behind. Under the old
plan it would have invalidated the premise after the build.

## Three Passes

The five steps below are the unit of work; **passes** are the unit of delivery and review. The
dependencies are narrower than the step list suggests, so more lands per pass.

| Pass | Contains | Ends when |
| --- | --- | --- |
| **A** | Step 1 baseline and Track R Batch 1, together. Read-only, no code. | Real numbers on the four measures, and the Track R gap list |
| **B** | Step 2 in full: bootstrap, store, Task and Action, retrieval, execution seam, receipts, fault tests. The host still does all editing. | The slice runs on the TypeScript adopter and is compared against Pass A's baseline |
| **C** | Step 3's one decision, measured; then Step 4's writing and recovery; then Step 5's second seam. | Each measured on its own evidence |

**Prove it on the TypeScript adopter, not the movement SDK.** That repository's scale and mixed
ecosystems would consume a pass on environment alone, and this machine cannot build its Kotlin
targets at all. It becomes a stress test once the slice works.

**Verification is the limiter, not authorship.** A pass that writes Pass B and fault-tests none of
it has delivered nothing; the recovery paths are where the value is.

## Sequence

| Step | Plan | Question it answers |
| --- | --- | --- |
| 1 | [Baseline one scenario](active/step-1-find-the-cost.md) | What does that scenario cost today, on the four measures the slice is judged on? |
| 2 | [Prove one workflow](active/step-2-assistance-in-host.md) | Investigate a failing check, fix, verify, resume after interruption - does it beat the baseline? |
| 3 | [One optional decision](active/step-3-one-decision.md) | Does adding a classifier improve accepted work, holding everything else fixed? |
| 4 | [Bounded dispatch and recovery](active/step-4-dispatch-and-recovery.md) | Can we apply results and recover from interruption safely? |
| 5 | [Expand from demonstrated reuse](active/step-5-expand.md) | Does a second host or ecosystem work without changing the core? |

Running alongside, not in the sequence:

| Track | Plan | Why independent |
| --- | --- | --- |
| R | [Release preparation](active/track-release-preparation.md) | Read-only, needs no classifier, dispatch or gate engine, and has a baseline already in the adopter's history |

A step does not start until the prior step's evidence exists. The release track depends on none of
them and may start at any time.

## Contracts With No Owning Step, Deliberately

Plugin Contract *(contract retired; the gate invariant lives in the umbrella)* has no step. The general plugin engine is deferred
until several consumers justify it, so nothing in this sequence builds one. The contract is retained
because the gate invariant it carries applies to any domain code, plugin or not, and
[Release Management](../specs/release-preparation.md) depends on that invariant while
[Track R](active/track-release-preparation.md) stays read-only.

## Settled Decisions

- **Repository.** `project-harness`, consuming the governance runtime through its published CLI and
  JSON surface only. Anything further is an upstream contribution, never a fork or a vendored copy.
- **Host language.** TypeScript on Node.
- **Store.** Files - JSON for records, Markdown for prose.
- **Front door.** The agent host, not a CLI of our own.
- **The host holds the pen.** The harness reads, checks and records; it does not write to a working
  tree in the first implementation. Harness-owned writing is planned for Pass C, after continuity
  is proven.
- **Plugin engine.** Deferred until several consumers justify it. The gate invariant survives
  without it.

## Candidate Repositories

The harness serves several projects that do not share a toolchain. Naming them here keeps the
sample honest and stops one ecosystem quietly becoming the design.

| Repository | Role | Ecosystem |
| --- | --- | --- |
| `project-governance` | The deterministic fact and check layer the harness consumes | Python |
| `portal-webapp` | First real adopter; also the Track R subject | TypeScript, npm |
| `asensei-mnemos` | Multiplatform SDK; the hardest build shape | Kotlin Multiplatform, Gradle |
| `coaching-intelligence-sdk-parallel-development` | `asensei-movement-sdk`; the hardest shape by a wide margin | Kotlin/KMP **and** npm **and** React Native, web, Ionic, Expo, in one repository |

That last repository resets several assumptions and should be treated as the design's stress case,
not an afterthought:

- **75 Gradle modules and 28 npm workspaces in one tree.** The adapter boundary assumed roughly one
  ecosystem per repository, with a repository able to register more than one. Here several coexist
  and interleave, so unit-to-adapter routing is load-bearing rather than incidental.
- **It is a git worktree** of a parent repository, which is how parallel development is already
  done. A workspace is therefore not the same thing as a repository, and several workspaces exist
  per checkout.
- **Machine-global resources are shared across those workspaces.** Metro ports, simulators and
  physical devices are owned per machine, not per workspace. A per-workspace claim does not cover
  them, which is a real gap in [Build Orchestration](../specs/execution.md).
- **A dev loop already exists** at `tools/dev-loop`, with durable state tracking device bindings,
  port ownership by process id, and deployment digests. That is prior art for exactly the
  operational state this proposal describes, and the harness should reference its receipts rather
  than recreate them.
- CI already runs mutation sweeps, nightly soaks and cross-platform compatibility releases.

## Environment Limit

The working machine has Node 22 and a JDK 11 with no Gradle, so real KMP builds cannot run there.
Steps prove on the TypeScript adopter; KMP proof waits for an environment that can run it and is
not claimed until then.

## Model Class Legend

Batches name a work class from the installed model-selection policy with the concrete pair from its
default table. An explicit operator choice or a project override replaces these, and the batch then
records the new pair and its source.

| Work class | Used here for | Default pair |
| --- | --- | --- |
| routine | Bounded work against a settled contract | gpt-5.6-luna, high |
| difficult-implementation | Demanding implementation, understood approach | gpt-5.6-luna, xhigh |
| ambiguous-integration | Wiring across components, hosts or toolchains | gpt-5.6-terra, high |
| diagnosis-review | Measurement, calibration, consequential review | gpt-5.6-sol, medium |
| deep-reasoning | Contract and protocol design with real consequences | gpt-5.6-sol, high |
| major-planning | Unresolved problems and plan revision | gpt-6-astra, low |

## Cross-Step Risks

- **Measuring the wrong thing.** Classifier accuracy is not accepted work, and a remedy that works
  is not proof of the predicted cause. Every step reports accepted results and rework, not only
  precision.
- **Unbounded loops.** Budgets bind to a task, not a request; a new request never resets them.
- **Authority drift.** Every effect declares operation, scope, destination and policy revision.
  Scope comes from the brief, never from a packet.
- **Provider dependence.** Dispositions and fallbacks exist from step 3. A question shipped without
  one has broken the plan.

## Rollback

Each step is independently removable in reverse order. The harness is additive: absent it, the
governance runtime, the build tooling and the hosts behave exactly as they do today.
