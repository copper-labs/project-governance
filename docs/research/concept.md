---
id: research.decision-first-harness
title: Decision-First Harness
type: research
status: draft
owner: project-governance
created: 2026-09-18
updated: 2026-09-19
summary: Conceptual proposal for a harness and governance system whose control plane runs on a decision model instead of an LLM.
---

# Decision-First Harness

Conceptual proposal. Nothing here is a design or a commitment. The point is to agree on the idea
and the first experiment.

## The Reframe

The pitch was "start with Jev and let it orchestrate." The idea underneath it is stronger than the
framing, so it is worth saying plainly:

**A coding harness spends most of its tokens deciding, not working.**

Which files matter. Which checks apply. Which model to call. Is this tool call risky. Did that test
fail because the code is wrong, the test is wrong, or the runner is flaky. Retry or escalate. Today
every one of those is a frontier-model call carrying a fat context. That is where the budget goes,
and it is why the loop feels slow.

So the proposal is not "Jev is the brain." It is: **move decisions out of the LLM, and give each
decision to the cheapest thing that can make it.** Jev is one of those things. It is a good one. It
is not the only one, and making it the core would repeat the mistake we are trying to fix.

## What Jev Actually Is

TypeSafe shipped it on 15 September 2026. Three days old at the time of writing. Early access,
waitlist, hosted API only, no open weights, no paper.

In plain terms: you hand it a **state** (text) and a list of **questions**. It hands back typed
answers with probabilities. Three question shapes only:

- **Choice** — pick one of up to 255 options
- **Score** — rate against 2 to 10 ordered levels
- **Noul** — yes or no

It cannot write anything. No code, no prose, no summaries, no explanation of its own reasoning. It
is bad at arithmetic, counting, and date comparison. Text only. State plus the longest question has
to fit in roughly 32k tokens.

The numbers that matter:

| | Jev | Frontier LLM call |
| --- | --- | --- |
| Cost per decision | ~$0.0001 | ~$0.10 – $0.50 |
| Latency | 0.1 – 0.7s | seconds to minutes |
| Questions per call | many, in parallel, priced per question | one |

An independent routing test put it at 0.64s median and $0.000025 per classification, roughly 3x
faster than a small fast LLM and correct on all 40 of its cases. That is a real, if small, outside
data point.

**This is a three to four order of magnitude change in what a decision costs.** That is the whole
opportunity. When a decision costs a hundredth of a cent you can afford to ask fifty questions
where today you ask one, and you can afford to ask them on every loop instead of once per task.

## The Shape: Three Tiers

Every decision the harness makes goes to the cheapest tier that can make it.

**Tier 0 — Facts.** Deterministic code. Git, ASTs, import graphs, test-impact maps, the packs in
this runtime. Free, exact, replayable, no vendor. Anything that can be computed is computed here.

**Tier 1 — Judgement.** Jev. Takes a small state that Tier 0 assembled and answers bounded
questions with probabilities. Fast and nearly free. Selects, ranks, classifies, gates, routes.
Never generates. Never approves on its own.

**Tier 2 — Generation.** The LLM. Writes the code, diagnoses the hard failure, explains the change.
Called last, with a context the two tiers below it already narrowed.

The rule: **the LLM is only called when something has to be written.**

## The Precondition: Move State Out Of The Model

Worth answering the question directly: no, the first move does not have to be a prompt. But the
thing to change is not the front door. It is where the state lives.

Nobody chose to make every move start with an LLM. It is a consequence of one fact: **the
conversation is the state.** Everything about what you are doing lives inside a model's context
window, so every action has to pass through the thing holding it. That single fact causes three
problems we keep patching around:

- **An entry tax on every turn.** System prompt, tool definitions, file reads, all reloaded at
  frontier prices before any work happens.
- **State that evaporates.** Compaction loses things. A new session starts from nothing. CLAUDE.md,
  AGENTS.md and memory files are all patches for this.
- **Lock-in that is structural, not contractual.** You cannot switch models mid-task because the
  task is *inside* the model.

Move the state onto durable storage and all three go away at once. The model becomes a stateless
worker: hand it a packet, take back a diff, let it forget. The front door becomes free - a CLI, a
hook, a git event, a scheduled job, an IDE, or still a prompt when that is the right surface.

And one more thing falls out, which is the part that matters here: **a decision model can only read
state that lives outside a model.** Jev's entire API is "here is a state, answer these questions
about it." If the state is trapped in a conversation, there is nothing for it to read. Externalising
state is not a separate idea from putting a decision model in the loop. It is the precondition
for it.

## Two Doors, Not One

The goal is not to remove the LLM from the front door. It is to stop every path going through it.

- **Shaped work** - run the right checks, pick the right tests, triage a failure, prep a PR, route
  to the owning spec, decide whether to escalate. Recurring, bounded, mostly decisions. This is the
  bulk of loop turns and almost none of it needs a frontier model.
- **Open work** - "I do not know why this is broken." Exploration is where an LLM earns its cost.
  That door stays, and the CLI hands it a prepared packet instead of making it start cold.

**Decision taken: the host stays the front door.** The first implementation is invoked from inside
the agent host already in use - Codex primarily, with Claude Code and Cowork supported. A front door
of our own is step two and is deliberately deferred. Nothing in the core may assume which step is
active.

A front door of our own must still accept plain English. The reason the current tools feel good is that you just
talk to them. If the new surface makes you think about command syntax it has already lost. Natural
language in, decision model routes, structure underneath. The conversation stays; the cost
structure behind it changes.

## Mnemos As The Substrate

If state has to live somewhere durable, inspectable and outside the model, we already have it.

Mnemos describes itself as a substrate for durable, inspectable product context that lets a host
preserve evidence, retrieve bounded context, maintain continuity and world-model state, reason over
governed inputs, and explain what it used. Read that as harness infrastructure rather than coaching
infrastructure and the fit is close to exact:

| Harness needs | Mnemos already has |
| --- | --- |
| A bounded context packet for a worker | `ContextAssembler.assemble()` returning `PackedContextEnvelope` |
| A durable record of decisions and outcomes | Experience Trace |
| An explanation of what was used and why | Evidence and lineage, with trace refs carried through |

Experience Trace is the striking one. Its recorded shape is the state before the episode, the goal,
what was expected, what was proposed or decided, what was observed afterward, and judgments or
corrections attached later. That is the decision log this proposal asked for, already specified and
marked implemented - including the part that makes calibration possible, which is attaching the
outcome to the decision after the fact.

Mnemos is also explicit that it does not run actions, compute rewards, learn policies or choose
future behavior. It deliberately does not decide. That is precisely the hole a decision model
fills. The two are complementary by design rather than by coincidence.

**Decision taken: not yet.** The first implementation stores state in JSON and Markdown files. A
richer substrate is reevaluated only once the harness is tuned and running, and only against the
baseline the file implementation produces. That keeps the comparison honest and stops two hard
problems being coupled on day one. The store boundary in
[State Store](decision-first-harness/specs/state-store.md) exists so that later decision stays cheap.

**Three cautions that informed it.**

1. **Be a customer, not a second owner.** The harness should consume published Runtime APIs and
   nothing else. The fastest way to damage Mnemos is to give it a second master with different
   needs and start bending its boundaries to suit dev tooling.
2. **Mind the language seam.** Mnemos is Kotlin Multiplatform with a JS/TS runtime; this governance
   runtime is Python. A CLI over both probably means a TypeScript host calling the Python CLI as a
   subprocess. That is a real decision and everything after it inherits the choice.
3. **Do not let the substrate become the project.** The loop can be proven with JSON files on disk.
   Mnemos earns its way in at the point where the file version starts to hurt, not before. Coupling
   two hard problems on day one is how six months disappear with no harness to show.

## The Five Big Rocks

### 1. Build the decision interface, not the decision model

One interface for every decision in the system: state in, typed answer plus confidence out. Jev is
one implementation behind it. A rules table is another. A small local model is a third. An LLM is
the expensive fallback.

This is the rock that actually delivers "less reliance on specific LLMs." The interface delivers
it, not Jev. Wiring Jev directly into the orchestrator would trade a soft dependency on several
interchangeable frontier models for a hard dependency on one three-day-old hosted model with a
waitlist and no second source. That would be a worse position than the one we are in.

Every question needs a deterministic fallback answer — usually the conservative one. If the
provider is down, the harness gets slower and dumber. It does not stop.

### 2. Deterministic candidates, cheap selection

Jev cannot read a repository. It reads about 32k tokens of text you hand it. So it can never
*find* context — it can only *choose among candidates*.

That means the real engine of this harness is the deterministic fact layer that produces the
candidates, and the quality ceiling is set there, not by the decision model. Good news: a lot of
that layer already exists in this runtime — impacted-path selection, change packets, pack
catalogs, context routing. The harness sits above it and calls it.

Practical consequence: most of the engineering is assembling small, high-signal states and writing
good questions. That is the craft of this thing.

### 3. The decision log is both the audit trail and the training set

Log every decision: state digest, question, options, probabilities, what was chosen, what happened
next.

That single artifact serves both halves of what we are building.

- **Forward, it is orchestration.** The record of what the harness decided and why.
- **Backward, it is governance.** Replayable evidence of why the machine did what it did — which
  is exactly what an LLM-driven harness cannot produce, because its reasoning is prose that was
  thrown away.
- **Sideways, it is calibration data.** It tells us where confidence is honest and where it lies,
  so thresholds get tuned on evidence instead of taste.

If there is one idea to anchor the effort on, it is this: **the harness and the governance system
are the same system read in two directions.** That is also the most defensible thing about the
concept, and the part no one else appears to be building.

### 4. Confidence drives an escalation ladder, not a yes/no

- High confidence → act.
- Middle → escalate: more state, a harder question, or Tier 2.
- Low → stop and ask the human.

And one hard rule, borrowed from this repo's existing stance that telemetry can never approve a
check:

**A decision model may narrow work. It may never approve it.**

Jev can choose which tests to run. It cannot declare the build good. Merges, pushes, publishes and
deletes stay behind deterministic gates, permanently.

### 5. Test selection and parallel execution are where the money actually is

This is the concrete token win, and the outside evidence points the same way. Anthropic's answer to
agentic CI load (CI jobs up 25x in six months) was not an agent — it was a deterministic
test-impact service. The pattern that works:

1. Tier 0 computes the impacted surface.
2. Tier 1 ranks and triages — app bug, test bug, infra, flake — *before* anyone reads a log.
3. Tier 2 writes the fix, once, with a narrow context.

Failure triage is the single best first target. Today a wall of build output goes to a frontier
model to be read. Classifying it first is exactly the shape Jev is built for, and it is the most
expensive thing in the current loop.

On parallelism: fan out for independent read-heavy work — test shards, builds, exploration. Do not
fan out concurrent writers to the same code. The field converged on that during 2026 and the cost
data is ugly; a three-agent run burns roughly seven times the tokens of one session.

## Where This Rubs Against The Stated Goals

Saying the uncomfortable parts out loud, since the point of the effort is to find out if the idea
survives them.

**Vendor dependence gets worse before it gets better.** Covered above. Rock 1 is non-negotiable
from day one or the whole premise inverts.

**Compounding is the real technical risk.** One decision at 90% is fine. Thirty chained decisions
at 90% is 4%. Nobody has published anything on chained decision-model thresholds — the most careful
public review of Jev lists exactly this as an open question. The design answer is that decisions
must stay independently checkable and recoverable: a wrong early decision has to be catchable by a
later deterministic fact, not merely inherited.

**Accuracy varies by domain more than the headline suggests.** On the vendor's own benchmark Jev
ties frontier models on average across four workflows but drops to 61.8% against 74.7% on one of
them. Averages are hiding something. We need our own eval on our own decisions.

**Calibration is asserted, not demonstrated.** The entire escalation ladder rests on confidence
meaning what it says. That is currently a marketing claim. Measuring it is cheap and we should just
do it.

**"From scratch" should mean the harness, not the fact layer.** Building a new CLI is right — this
runtime was never meant to orchestrate. Rebuilding deterministic change analysis underneath it
would be waste.

## Sequence

Agreed order. The principle behind it: **cheapest and most reversible first, irreversible last.**
Each phase also produces the evidence the next one needs, so the order is not only about risk.

Phases 1 and 2 do not require the harness to exist as a product. They can be scripts. Do not build
a CLI to find out whether the idea works.

### Phase 0 - Measure

Shadow the decisions we already make with a model. Run the decision model alongside, deciding
nothing, seeing the same state. Record both answers and what actually happened.

*Exit:* an agreement rate and a calibration curve per decision type, real cost and latency on our
own work, and a shortlist of the decisions worth moving. A negative result ends the effort cheaply,
which is the point.

### Phase 1 - Build Hygiene, No Model

Build identity, one build lock per workspace, and the staged ladder. The canary ranking starts as a
static rule; a decision model is not needed to begin. Every build recorded with inputs, targets,
duration, outcome.

*Exit:* duplicate and colliding builds gone, failures surfacing materially earlier, and a recorded
build history that the later phases can learn from.

### Phase 2 - Decision Interface And The First Decision

The interface - state in, typed answer and confidence out - with a deterministic fallback for every
question. Its first consumer is build and test failure triage, chosen because a wrong answer costs
one wasted cycle. Decisions and outcomes land in the trace.

*Exit:* triage accuracy measured against recorded outcomes, retries bounded at one, and most failure
classes resolving without reaching a model.

### Phase 3 - Harness As A Tool

Mode 1 under the existing desktop app: intent classification, deterministic resolution, packet
assembly over the existing `context` command, then one worker call.

*Exit:* packets demonstrably better than what a model finds for itself. The honest metric is how
often a worker asks for something the packet did not contain.

### Phase 4 - Tighten On Evidence

Map families down to lanes, calibrate thresholds against the trace, prune checks and lanes that
never fire. Selection changes justified by recorded history rather than intuition.

*Exit:* the selection maps are maintained from data, and the confidence thresholds have a reason
behind each number.

### Phase 5 - Release Management Plugin

Last, because a wrong decision here costs an incident rather than a cycle. Start with the portal
adopter, where the baseline is already in its git history. Internal order:

1. Fill the release evidence packet automatically - no model, largest saving.
2. Harvest the evidence checkers into a declared catalog.
3. Generate the promotion runbook from the packet.
4. Run one gated transition end to end - staging promotion, evidenced and recorded.

*Exit:* one staging promotion through the gate model, compared directly against the hand-written
runbooks it replaces.

## Notes In This Series

- [The flow, end to end](decision-first-harness/flow.md) - how a task moves through the harness and
  where the tokens go.
- [Builds and checks](decision-first-harness/builds-and-checks.md) - KMP multiplatform builds, lane
  selection, failure triage, build identity.
- [Release management as a plugin](decision-first-harness/release-management.md) - the gated state
  machine and the plugin contract.
- [Portal case study](decision-first-harness/portal-case-study.md) - what one adopter already built
  by hand, and the three moves with the clearest payoff.

The concept above is now carried into draft contracts and plans:

- [Specifications](decision-first-harness/specs/README.md) - an umbrella contract and eleven focused
  children.
- [Master plan](decision-first-harness/plans/README.md) - six phase plans, each with exit evidence
  and model work classes.

## Open Questions

1. **Which ten decisions hurt most today?** Still the input I most need. The taxonomy a decision
   model routes against has to be derived from the work we actually do, not invented. Designing
   that closed set is the real project; everything else is plumbing.
2. **Where does this live?** This repo is charter-bound to be project-neutral with no model
   invocation path in governance. A harness is a different product. Its own repo, with this runtime
   and Mnemos as dependencies?
3. **Host language for the CLI.** TypeScript buys native Mnemos and costs a subprocess hop to the
   Python governance runtime. Worth settling early because it is hard to reverse.
4. **Is this ours, or is it a product?** Changes how strict the decision-interface boundary has to
   be, and how soon.
5. **The IDE.** Park it, or does it shape the state model now? The decision log and the trace are
   what an IDE would visualise, so the answer affects what gets recorded from day one.

## Sources

- [TypeSafe System One concepts](https://docs.typesafe.ai/concepts/system-one)
- [Jev release guide, benchmarks and pricing](https://www.developersdigest.tech/blog/typesafe-jev-system-one-models-release-guide-2026)
- [Deep dive on Jev limits and failure modes](https://flaviocopes.com/jev/)
- [What is claim and what is verified](https://pearpages.com/blog/2026/09/16/jev-sorted-what-typesafes-system-one-model-actually-is-and-what-is-still-just-a-claim)
- [Hands-on Jev model routing experiment](https://dev.classmethod.jp/en/articles/jev-for-llm-model-routing/)
- [Building a harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev)
- [Anthropic on scaling test impact analysis](https://claude.com/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic)
- [Deterministic orchestration for multi-agent workflows](https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/)
- [Coding agent harness tax](https://arena.ai/blog/coding-agents-harness-tax)
- [Don't build multi-agents](https://cognition.com/blog/dont-build-multi-agents)
