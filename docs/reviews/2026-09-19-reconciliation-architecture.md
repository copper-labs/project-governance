---
id: review.reconciliation-architecture-2026-09-19
title: Reconciliation Of The Architecture Review
type: research
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Per-finding disposition of the architectural review, the two contracts it produced, the rebuilt sequence, and two points argued back.
---

# Reconciliation Of The Architecture Review

> **Contract references below are historical.** The specification set was reorganized on
> 2026-09-19 around four objects - Task, Action, Artifact, Evidence. See
> [the specifications index](../specs/README.md); superseded files remain in git history.

Response to [the architecture review](2026-09-19-architecture-review.md). All nine findings
accepted. Two carry a note back rather than a disagreement.

This review attacked the concept rather than the wording, and three findings identified defects
that would have survived into implementation: a task model that could not distinguish "investigate"
from "apply" while granting the same write permission (A2), a recovery model that fabricated a
clean restart after a partial effect (A5), and a data boundary that recorded digests while saying
nothing about what was transmitted (A6).

## Disposition

| # | Finding | Disposition | Where the fix landed |
| --- | --- | --- | --- |
| A1 | Optimize accepted work, not a mandatory tier cascade | Accepted | [Harness Core](../specs/harness-core.md), [Decision Interface](../specs/decision-interface.md) |
| A2 | Externalize the task's meaning | Accepted | New Task Brief *(superseded contract)*; [Worker Invocation](../specs/worker-invocation.md), Context Packet *(superseded contract)* |
| A3 | Allow bounded exploration | Accepted | [Worker Invocation](../specs/worker-invocation.md), Context Packet *(superseded contract)* |
| A4 | Verification and acceptance are different | Accepted | Task Lifecycle *(superseded contract)* |
| A5 | Durable records do not make side effects atomic | Accepted | Task Lifecycle *(superseded contract)*, State Store *(superseded contract)* |
| A6 | Carry authority and data boundaries across the seam | Accepted | New Action Authority *(superseded contract)*; [Host Integration](../specs/host-integration.md) |
| A7 | Separate coordination, reuse and scheduling | Accepted, with a note | Build Orchestration *(superseded contract)*, [Step 5](../exec-plans/active/step-5-expand.md) |
| A8 | Measure interventions, not classifier accuracy | Accepted | Decision Record *(superseded contract)*, [Failure Triage](../specs/failure-triage.md), [Step 3](../exec-plans/active/step-3-one-decision.md) |
| A9 | Release preparation without a plugin engine | Accepted, with a note | Plugin Contract *(superseded contract)*, Release Management *(superseded contract)*, [Track R](../exec-plans/active/track-release-preparation.md) |

## Two Contracts Added

- **Task Brief *(superseded contract)*** holds the desired outcome, constraints in force,
  acceptance evidence, scope, open questions and ruled-out hypotheses. Every item records whether it
  is an operator instruction, an observed fact, or a worker hypothesis, and only the appropriate
  owner may change each. A new instruction revises the brief and invalidates affected pending
  actions; it never retroactively authorizes work already done.
- **Action Authority *(superseded contract)*** requires every executable request to declare
  its operation, scope, destination and policy revision, enforced before effects and after path
  resolution. It also carries the data boundary: anything offered to a hosted provider must satisfy
  the project's export rules before transmission, and source text, tool output and provider
  responses are evidence, never instruction or authority.

## What Changed, By Finding

**A1.** The tier rule is now a stated default with explicit escape routes - a known command skips
classification, a novel design task may go straight to a reasoning worker, the host path stays
available - rather than an admission test requiring proof that every lower tier was incapable. What
the harness optimizes is accepted work per unit of time and cost at an acceptable error rate.
Deterministic ownership of facts, permissions and gates keeps no escape route. Question confidence
and action safety are now separate quantities: a threshold is set from the consequence of a wrong
action and the evidence that action requires. Providers negotiate the question shapes their enabled
consumers actually use rather than being required to implement all three.

**A2.** The brief above. Also: "stateless worker" now means no required hidden provider session,
not a prohibition on explicit handoff. The blanket ban on model-produced packet content is replaced
by a provenance rule - a labelled handoff note may be carried as deterministic content, marked as a
hypothesis and never as fact. The old rule would have excluded exactly the handoff that stops a
fresh worker repeating a paid-for dead end.

**A3.** Two worker patterns behind one action boundary: a bounded transform over known inputs, and a
bounded investigation that may request further reads or approved experiments. Bounds are per task,
not per request, so a new request cannot reset the budget. Control returns when the next step needs
greater authority or new operator input - not merely because the first packet was incomplete.

**A4.** `verified` no longer implies accepted. Verification records the claim checked, the exact
subject, the evidence produced and any acceptance obligation still open. Mandatory acceptance
requirements bind to the authorized baseline rather than the subject the worker produced, which
closes the circularity where a worker edits implementation, tests and check-selection policy and
then passes.

**A5.** `prepared`, `in-progress` and `outcome-unknown` states were added. After an interruption the
actual effects are inspected before anything is retried; where the outcome cannot be established it
is retained as unknown rather than resolved by assumption. Transitions carry an expected revision so
two processes reading the same prior state cannot both act. Effects are idempotent or explicitly
non-retryable, and no exactly-once claim is made. Corrupted **execution** state now stops rather
than being quarantined and read as "nothing happened" - that line was the fabricated clean restart
the review warned about.

**A6.** The contract above. Scope for an effect comes from the brief and policy, never from whichever
paths ended up in a packet. A routing instruction in a host file is now described as advisory
coverage rather than enforcement, and a mode whose capabilities an adapter cannot demonstrate is
reported unsupported.

**A7.** Build hygiene is split into three concerns that must each earn adoption separately:
coordination, evidence reuse, and ordering. Reuse is named a verdict cache, because that is what it
is; "we store no artifacts" was a naming dodge that did not remove the freshness obligation. The
staged ladder is labelled a hypothesis, with the review's own arithmetic in the contract, and is
adopted only if the whole distribution improves.

**A8.** Diagnosis correctness, remedy outcome and task acceptance are three separate recorded facts.
A remedy that works is evidence of its effect, not proof of the predicted cause; an unestablished
cause is recorded unconfirmed and never counts toward accuracy. Evaluation splits by task or failure
episode so retries cannot leak, incomplete evaluation cannot authorize a weaker threshold, and a
provider upgrade requires a replay check and a working disable path.

**A9.** Read-only release preparation is now an independent track that can start immediately and
depends on no step. The general plugin engine is deferred until several consumers justify it.

## Sequence Rebuilt

The six-phase plan is replaced by the review's shape: find the recurring cost, prove assistance
inside the host with no model, try one optional decision, add bounded dispatch and recovery only
when needed, expand from demonstrated reuse. Release preparation runs alongside as its own track.

The old plan presumed classification was the bottleneck and built an evaluation for it first, which
presumed its own conclusion. Under the new sequence a negative result at step 3 removes one feature
and leaves a working tool behind.

## Two Notes Back

**A7 - the cost of using the existing execution owner.** Agreed, and adopted. Worth stating the
price: that owner is the Python governance runtime in a different repository, so a TypeScript
harness depending on it for resource claims is a cross-repository, cross-language coupling from the
first integrated slice. That is a better trade than inventing a second owner, but it is a real cost
and if a required seam is missing it becomes an upstream contribution rather than a workaround.

**A9 - what the four declarations were doing.** The reversal is accepted; one consumer is not
evidence for a framework. The four-declaration rule was, however, doing one useful job: stopping
domain code from growing its own orchestration. Dropping the framework keeps the part that mattered
- domain code may do more than four things, in its own repository, but it still may never lower a
gate, and that invariant is now stated independently of any plugin mechanism.

## Still Open

- **Provider access.** The probe still awaits credentials. Under the new sequence this blocks only
  step 3, which is now third rather than first.
- **Repository bootstrap.** Charter, agent instructions, governance adoption and hooks are step 2
  batch 1 and are not yet written.
- **Step 1 has not run**, so the intervention that steps 2 and 3 should target is not yet chosen.
