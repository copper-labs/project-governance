---
id: research.decision-first-harness.release
title: Release Management As A Plugin
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Release and deployment modelled as one gated state machine delivered as an optional plugin.
---

> Part of the [Decision-First Harness](concept.md) research
> effort. That page carries the concept, the risks, and the sequence.

# Release Management As A Plugin

Release and deployment work looks like a separate product, but it is the same machine with the
stakes turned up. Worth folding in now, because it changes one core rule rather than adding a
parallel system.

## It Is One State Machine, Not Eight Features

Merging to staging, deploying, smoke testing, validating an environment, planning a promotion,
handling resources, deploying to production and verifying afterwards are not eight capabilities.
They are states and the gates between them:

```
branch -> merged -> staged -> validated -> promotion candidate -> released -> verified
```

Executing a transition is a script, and those scripts mostly exist already. What costs time is
everything around them: deciding whether a gate is satisfied, assembling the evidence for a
promotion, diagnosing an unhealthy environment, writing the plan, and judging whether a smoke
failure is real. Those are decisions and prose, which is the split this whole proposal is built on.

## The One Rule That Changes

The inner loop is recoverable. A wrong decision makes a wrong diff, the checks catch it, you retry,
and it cost a few cents. Releases are not recoverable. A wrong decision migrates a database or
reaches real users.

So the rule stated earlier becomes load-bearing rather than tidy: **a decision model may narrow and
prepare; it may never approve.** In the inner loop, acting at high confidence is fine. At a release
gate, the decision model's job is to assemble the evidence and present it, and a human or a
deterministic policy decides. Rollback triggers are thresholds in code, never a model call. A model
may raise a flag early; it may not pull the lever.

## Where Each Piece Sits

| Step | Deterministic | Decision model | LLM |
| --- | --- | --- | --- |
| Merge to staging | Mergeability, required checks, conflicts | Which open PRs are safe to batch; risk class of a change | - |
| Deploy to staging | The whole thing | - | - |
| Smoke tests | Running them | Failure triage: regression, environmental, flake, data-dependent | Only for a real regression |
| Validate an environment | Collect signals: version drift, migration state, config diff, quotas, error rates | Score whether the environment can receive a promotion | - |
| Promotion plan | Assemble what changed, risk class, rollback path, ordering | Rank and classify the contents | Write the plan and notes from the packet |
| Resources | Infra state, quotas, capacity | Score risk for this particular deployment | - |
| Production deploy | Execution and approval | **Nothing** | - |
| Post-deploy verify | Collect signals; threshold the rollback trigger | Classify healthy, degraded, roll back | Only to explain afterwards |

Environment validation is the best fit on the list. "Is this environment in a state that can receive
a promotion" is precisely a scored judgment over many assembled signals, and it is a question people
currently answer by reading dashboards.

## The Plugin Contract

The governance runtime already has the right shape: a generic core, project-owned packs, and an
explicit contract for a pack that takes ownership of built-in behavior. The harness should copy it.

A release plugin declares four things and nothing else:

- **States and allowed transitions**
- **Gates** - the deterministic facts required, the decision questions to ask, the confidence
  thresholds, and who approves
- **Commands** that execute a transition
- **Records** that the transition writes to the trace

The core owns the loop, the decision interface, and the trace. The plugin owns its domain. That
keeps release management genuinely optional, and it means a second plugin fits the same way.

One invariant belongs in the core rather than the plugin: **a plugin may raise a gate, never lower
one.** No plugin can grant itself automatic approval for an irreversible action. If that is a
plugin choice, the safety property is only as strong as the least careful plugin.

## Two Shapes, One Machine

These repos already show both shapes. Mnemos publishes artifacts - versions, tags, packages to
Maven and npm - while the bolt-on projects promote builds through environments. Same state machine,
different states and gates. This is the argument for modelling gates generically instead of
hardcoding "staging" and "production": the SDK publication path is the same machine with different
names, and it already has promotion and repair-lane concepts in its workflows.

## What Cheap Decisions Actually Unlock Here

Not a cheaper version of today. A different rhythm.

Right now promotion is a batch event: someone decides to cut a release, then spends hours
assembling state that was knowable all along. When evaluating a gate costs a hundredth of a cent,
readiness can be evaluated after every merge, continuously. The promotion packet is always current.
"Can we ship right now, and if not what is missing" stops being a two-day exercise and becomes a
question with a live answer.

That is the capability worth aiming at. The token saving is incidental next to it.

## Why This Is Not Ancillary

It is where the governance half pays for itself.

The inner loop justifies the Experience Trace on efficiency grounds - decisions get cheaper and
calibration data accumulates. Release management justifies the same ledger on risk grounds. A
promotion decision needs evidence: what changed, what was checked, what passed, what the environment
looked like, who approved. That is the trace, read at a different altitude. After an incident, "why
did we ship this" is answerable from the same record, and the logging obligations arriving through
ISO 42001 and the EU AI Act are architectural rather than retrofittable.

**The dev loop produces the evidence. Release management consumes it.** One ledger, two altitudes.
That is the case for building them as one system rather than two.

## Cautions

- **Do this last, not first.** Prove the decision layer where failures are free. Build triage costs
  a wasted cycle when it is wrong; a release gate costs an incident.
- **Aim at preparation, not automation.** The value is assembling a promotion packet so a person
  decides in two minutes instead of forty. Removing the person is not the goal and would forfeit
  the governance argument above.
- **Do not rewrite the scripts that work.** The plugin wraps, gates and records existing deploy
  tooling. Reimplementing it is how this becomes a second product.
- **Start with the gate model and one transition.** Staging promotion, end to end, recorded. Eight
  capabilities at once is a year of work and proves nothing sooner.
