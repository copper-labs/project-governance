---
id: research.decision-first-harness.portal
title: "Case Study: A Portal Adopter"
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: What an adopting project already built by hand, and the three moves with the clearest payoff.
---

> Part of the [Decision-First Harness](../2026-09-18-decision-first-harness.md) research
> effort. That page carries the concept, the risks, and the sequence.

# Case Study: A Portal Adopter

One adopting project already runs governance plus bolted-on release capability, so it is the best
evidence of what the plugin should and should not do. Nothing below is a criticism of the work;
it is the clearest description available of where the cost actually sits.

## What Is Already There

- `config/github-environments.json` declares environments with required reviewers, wait timers,
  branch policy, required variables and secrets, and operator notes. That is already a gate
  declaration in data.
- `config/policies/review-gates.yaml` declares review lanes, which change families require them,
  command evidence, and coverage floors.
- `config/ci-impact-map.json` selects impacted CI, the same idea as the KMP change selector.
- `scripts/release/` holds twelve evidence checkers and a release-evidence packet builder.
- `docs/release-evidence/` holds twenty-one dated evidence artifacts.
- `docs/release-runbooks/` holds ten production promotion plans and twelve staging plans.

This is the machine described in the previous section, built by hand. The gate model is not a new
idea for this project; it is the idea this project has been implementing one release at a time.

## Where The Cost Sits

The ten production promotion plans were written between 18 June and 17 July. Roughly one bespoke
promotion document per working week, each authored from scratch.

Three things scale with releases rather than staying flat:

1. **A new evidence checker per concern.** Twelve checkers, most with a paired test file, several
   named for the specific thing they were written to prove. Two are pinned to a version that has
   shipped. Each release that raises a new concern tends to add code rather than data.
2. **A hand-written runbook per promotion.** The content - what changed, which migrations, risk
   areas, rollback, ordering - is derivable, but it is retyped every time.
3. **A manually completed evidence packet.** The packet builder says so plainly: it gathers cheap
   repo facts and "leaves live Vercel, GitHub, Supabase, and provider facts as fields for an
   approved release operator to fill later."

The gates are also spread across three surfaces - environment config, review-lane policy, and the
checker scripts - so no single place answers "what does this transition require."

## The Three Moves, In Order Of Payoff

**1. Fill the packet automatically.** The live facts the packet leaves blank are all API-queryable.
This is pure Tier 0 work with no decision model involved, and it is almost certainly the largest
single time saving in the release process. The packet stops being a form and becomes current state.

**2. Turn the checkers into a catalog.** Twelve scripts are twelve encoded lessons about what this
product needs proven - purchase path, provider privacy, clean checkout, grouped sign-off. Do not
delete them; harvest them into declared evidence types with requirements expressed as data, behind
one evaluator. New concerns then add a catalog entry rather than a script and a test. The
version-pinned ones are the exception worth auditing; a check bound to a shipped release is dead
weight.

**3. Generate the runbook from the packet.** This is the one place an LLM clearly belongs in the
release path: writing the promotion plan from assembled facts. It is prose over known content,
which is exactly what a language model is for, and it replaces the most repeated manual step.

## Where A Decision Model Fits Here, Narrowly

- **Risk class per change in the promotion set.** The taxonomy already exists in
  `code-quality.yaml` sensitive globs - migrations, auth, payments.
- **Which evidence types this change requires.** This is the root cause of checker proliferation:
  nobody knows at change time what will need proving, so proof gets written after the fact. Routing
  a change against a declared catalog is a classification problem.
- **Environment readiness score** over the assembled packet.
- **Smoke and end-to-end failure triage**, the same pattern as build triage.

Approval stays where it is. `Staging` already requires a reviewer and forbids admin bypass. That is
good discipline and the plugin should inherit it untouched, not relax it.

## Why This Is The Right First Plugin

The pain is measurable here in a way it is not elsewhere: time spent filling packets and writing
promotion plans, counted per release, against a baseline that already exists in the repository's own
history. A single transition - staging promotion, gated, evidenced and recorded - can be compared
directly against the twelve staging runbooks already written by hand.
