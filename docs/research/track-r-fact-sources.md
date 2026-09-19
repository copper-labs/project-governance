---
id: research.track-r-fact-sources
title: Track R - Release Fact Sources
type: research
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The twenty-five live facts the portal's release packet leaves for an operator, and where each could be obtained.
---

# Track R - Release Fact Sources

Read-only survey of `scripts/release/create-release-evidence-packet.py` in the portal adopter. The
builder says plainly what it does: it "gathers repo facts that are cheap to inspect and leaves live
Vercel, GitHub, Supabase, and provider facts as fields for an approved release operator to fill
later."

It leaves **25 fields marked `pending`**, each filled by hand, every release.

## What The Builder Already Does

Version calculation inputs, the latest migration, changed paths, an exception-ledger expiry
snapshot, and the optional local check list are all computed. That part needs nothing.

## The Twenty-Five Pending Fields

Classified by whether a machine could fill them. Tooling already in the repository is noted, since
the point is to call what exists rather than build clients.

### Obtainable now — 11

These have a client or CLI already present in the repository.

| Field | Source | Present as |
| --- | --- | --- |
| Vercel deployment id and URL | Vercel project API | `.vercel/project.json` holds the project and org ids |
| Vercel alias/domain target | Vercel API | as above; `sync-staging-mission-alias.mjs` already talks to it |
| Build logs and warnings | Vercel API | as above |
| Supabase staging migration state | Supabase CLI | `supabase` 2.109.1 is a dependency; `supabase/migrations` is in-tree |
| Supabase production pre/post migration state | Supabase CLI | as above |
| Supabase project ref | `supabase/config.toml` | in-tree |
| Coordinated app deployment SHA | git + GitHub API | in-tree |
| Version calculation | `scripts/ci/compute-next-release-version.sh` | already scripted |
| Git tag and GitHub Release URL | GitHub API | deliberately absent at Level 1 |
| Sentry status | `@sentry/nextjs` 10.48.0 | dependency present |
| Inngest status | `inngest` 3.54.0 | dependency present |

### Obtainable with a defined query — 7

Nothing missing, but the question each answers has to be decided before it can be automated.

| Field | What has to be decided first |
| --- | --- |
| Runtime logs and health routes | Which routes constitute health, and over what window |
| Environment registry status | What "current" means against `config/github-environments.json` |
| Provider mode and webhook status | Which providers are in scope for a given release |
| Staging SES simulator release smoke | `@aws-sdk/client-sesv2` is present; the pass criterion is the open part |
| Production SES simulator release smoke | as above |
| SES simulator evidence artifact | Where the artifact lands and how long it stays valid |
| Database release packet | Which of the `supabase/proofs` outputs count |

### Human judgment — 7

These should stay human. Automating them would be the governance theatre the reviews warned about.

| Field | Why it stays |
| --- | --- |
| Approval record | The approval is the human act; recording it is not the same as making it |
| App/database ordering pattern | A decision about this release, not a fact about the system |
| Staging carry-forward data preservation notes | Judgment about what matters in this data |
| Data/backfill dry-run counts and reconciliation | Counts are mechanical; the reconciliation is not |
| Release runbook timeline | Narrative |
| Release runbook errors and interventions | Narrative, and the most valuable field in the packet |
| Release process improvement notes | Narrative |
| Rollback/remediation plan | Must be written by someone who will execute it |

## What This Implies

**Eleven fields are free.** Every client they need is already a dependency, and two existing release
scripts already talk to the systems in question. The work is calling them and preserving the
receipt, not building integrations.

**Seven need a decision, not a client.** The blocker is a definition — what counts as healthy, what
counts as passing — and that is a conversation, not code. Worth having once and encoding.

**Seven should never be automated**, and the packet is better for saying so. A field marked
"human" that is actually filled by a human is not a gap.

So the realistic claim for Track R is **18 of 25 fields off the operator's hands**, not 25, and the
remaining seven are the ones worth their time. That is the number to measure against, and it should
be measured as operator minutes rather than field count, since the narrative fields are where the
minutes actually go.

## What Was Not Done

No live system was contacted. No credential was read. This is a survey of what the repository
declares and depends on, not a verification that any of those endpoints answer.

## Change Log

- 2026-09-19: First survey.
