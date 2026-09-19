---
id: research.decision-first-harness.flow
title: The Flow, End To End
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: How a task moves through the harness end to end, and where the tokens go.
---

> Part of the [Decision-First Harness](concept.md) research effort.
>
> **Superseded in part.** Written before the store and front-door decisions were settled. Mnemos is
> *not* the store - files are, until a tuned baseline exists. And execution state is recorded before
> the action it covers, not after verification as step 7 below implies. The
> [contracts](../specs/README.md) are authoritative.

# The Flow, End To End

Concrete walkthrough, because the pieces only make sense wired together. Assume a repo with the
governance runtime, the harness CLI, and Mnemos installed, and a desktop LLM app such as Codex as
the place you type.

## Two Modes

The endgame is that you type at the harness and it calls a model only when something has to be
written. But nothing has to start there, and it should not.

- **Mode 1, harness as tool.** Codex stays the front door. Its thin adapter file tells it one
  thing: before doing anything else, call the harness. Codex stops being the explorer and becomes
  the writer. This works today and captures the larger half of the saving.
- **Mode 2, harness as front door.** You type at the CLI. Codex becomes one worker it can call.
  This captures the rest, and it only makes sense once Mode 1 has proven the decisions are good.

Mode 1 is also the honest way to test the idea: if the packets it produces are not better than what
the model finds on its own, we learn that cheaply and stop.

## Who Owns What

| Piece | Owns | Has a model? |
| --- | --- | --- |
| Codex or Claude | Writing code and prose. Diagnosis when it is genuinely open-ended | Frontier LLM |
| `harness` CLI | The loop. Calls everything else. Holds no intelligence of its own | No |
| Jev | Typed decisions over an assembled state | Decision model |
| `project-governance` | Facts and proof: impacted paths, packs, checks, context packets | No |
| Mnemos | State: task record, context envelope, Experience Trace | No |

## One Task, Step By Step

Take a real one: *"the wasm test is failing after the ladybug bump."*

**0. Entry.** You type it into Codex. Its adapter says to call `harness intent "..."` first. That
first model turn is a single tool call, not an exploration.

**1. Classify.** One Jev call, roughly 150ms and a hundredth of a cent. The state is the intent plus
facts the harness already has for free: current branch, changed files, last failing check, any open
task in the trace. Six questions answered in that one call:

- what kind of work is this
- does it need code written at all
- is anything about it irreversible
- how specifically is the target named
- which surface does it touch
- is this a continuation of something already open

That is the move that today costs a full frontier turn carrying the whole preloaded context.

**2. Resolve.** Deterministic and free. `project-governance plan --mode impacted --json` returns the
impacted packs and paths. Git returns the diff against the bump. The test-impact map returns
candidate tests. Mnemos returns the open task record and any prior traces touching that area.
Nothing has entered a model yet.

**3. Narrow.** Jev again, because now there are candidates and candidates need ranking. Of forty
touched files, which eight matter. Of two hundred lines of failure output, is this an app bug, a
test bug, infrastructure, or a flake. Which pattern pack applies. Does this need a frontier model
or will a cheap one do.

This is the step that matters most for cost, because **the narrowing happens before anything enters
an LLM context.**

**4. Assemble.** `project-governance context --task` already does bounded selection with explicit
byte budgets, and Mnemos wraps it as an envelope with trace refs. Out comes a small, inspectable
packet: eight files, the owning spec section, the selected skill, the failing assertion rather than
the whole log, and the last decision made about this area.

**5. Generate.** Now a model is called, once, with the packet, for a bounded job. If step 3 said a
cheap model suffices, it goes to a cheap model. Swapping providers here is a config line, because
the state was never inside the model.

**6. Verify.** Impacted checks run. Findings come back normalized. No model reads them unless
something fails in a way that needs interpreting.

**7. Record.** Every decision from steps 1 and 3, the packet identity, and the outcome of step 6 go
into the Experience Trace. When CI later passes or fails, that judgment attaches to the same
episode.

**8. Loop or stop.** If checks failed, Jev classifies the failure: same cause, new problem, or needs
a human. Confidence picks the branch.

## Where The Tokens Actually Go

Five places, in rough order of size. These are structural claims about where the cost sits, not
measurements. Measuring them is what the shadow-mode probe is for.

1. **Discovery leaves the context.** Today a model reads files to work out which files matter, and
   every one of those reads stays in context for the rest of the session. Here, candidates are
   generated deterministically and ranked by Jev, and only the winners are ever shown to a model.
   This is the biggest line item.
2. **Logs get classified, not read.** A failing build is thousands of tokens that currently go to a
   frontier model. Classification needs a slice; the packet carries the assertion.
3. **Shaped turns stop being model turns.** Running the right checks, selecting tests, preparing a
   PR body, routing to the owning spec: these complete with no LLM call at all.
4. **No re-establishing context.** The next turn gets a fresh packet, not a replayed transcript,
   because the state lives in Mnemos.
5. **Tier matched to job.** Mechanical edits stop being billed at frontier rates.

## What It Does Not Save, And What It Costs

- **Generation does not get cheaper.** Hard work still costs frontier prices. Everything around it
  is what shrinks.
- **In Mode 1 the app's own overhead stays.** Codex still loads its system prompt and tool
  definitions every turn. That tax is theirs, and only Mode 2 removes it.
- **Latency is added, a little.** Three or four Jev calls add perhaps a second or two. Trivial
  against a frontier turn, but not zero.
- **A bad narrowing decision is a real failure mode.** Starve the model of the one file it needed
  and it will confidently produce the wrong fix. Two mitigations: the packet is inspectable, and a
  worker asking for something the packet lacks is logged as evidence the narrowing was wrong. That
  signal is exactly the calibration data the trace is there to collect.
