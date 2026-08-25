---
id: spec.skill-utilization
title: Skill Selection And Utilization Specification
type: spec
status: current
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Defines provider-neutral context selection and bounded local receipts for examining reported skill use after governed work.
---

# Skill Selection And Utilization Specification

## Purpose

Governed skills must be more than discoverable files. The runtime selects exact skill bytes before
work and records enough content-free evidence to inspect reported use afterward. Users do not need
to name individual skills, and Codex, Claude, or another host receives the same Markdown bytes and
closeout vocabulary.

Telemetry remains advisory. A receipt can show that a host reported a skill as applied; it cannot
prove that every instruction was followed or that the resulting work is correct.

## Selection Boundary

An adopting repository remains activation authority. Its matched context route names a top-level
skill or stack router, and optional target-owned facts allow the runtime to compose nested leaves.
The runtime then:

1. verifies package-owned skill bytes against the installed wheel;
2. applies the route's separate skill-byte budget;
3. materializes the exact selected bytes in a content-addressed ignored context packet;
4. returns skill IDs, paths, digests, activation levels, bounded reasons, exclusions, and blockers;
5. creates a random utilization ID when the public `context` command delivered at least one skill;
   and
6. appends one bounded `skill-selection` event to the existing local telemetry ledger.

The event reduces selection reasons to `route`, `task`, `path`, and `fact`. It never stores the
reason value, task text, changed path, repository fact, source content, or skill body.

Direct library calls and provider-native skill discovery are not observable unless their
coordinator deliberately uses the same public contract.

The coordinator should retain the exact result without shell redirection:

```text
project-governance context \
  --task <description> \
  --json-output .governance/runtime/context-result.json
```

## Closeout Boundary

After work and relevant validation, the coordinator runs:

```text
project-governance skills closeout \
  --context-result <context-result.json> \
  --outcomes <skill-outcomes.json>
```

The context result must be the exact result returned for the task. The outcomes document is one
JSON object:

```json
{
  "task_outcome": "completed",
  "skills": [
    {
      "id": "kmp-implementation",
      "status": "applied",
      "influences": ["decision"]
    },
    {
      "id": "kmp-test-and-evidence",
      "status": "consulted-no-change",
      "influences": []
    }
  ]
}
```

`task_outcome` is one of `completed`, `partial`, `blocked`, `failed`, or `cancelled`. Every
materialized skill appears exactly once with one status:

| Status | Meaning |
| --- | --- |
| `applied` | The skill influenced a decision, edit, validation, or restraint outcome. |
| `consulted-no-change` | The skill was read and relevant, but repository evidence already satisfied it. |
| `declined` | A conflict, false-positive route, or target-specific fact made it inapplicable. |
| `unavailable` | Selected content could not be resolved or verified during work. |
| `not-read` | The selected content was not consumed. |

An `applied` entry names at least one fixed influence: `decision`, `edit`, `validation`, or
`restraint`. Other statuses name no influence. Free-form explanations belong in the normal task
handoff, not telemetry.

The runtime verifies the utilization ID, context-packet ID, complete skill set, content digests,
and materialized bytes before appending one `skill-utilization-terminal` event. Repeating the exact
closeout is idempotent; a conflicting closeout for the same utilization ID is rejected from the
ledger. Telemetry write failure is visible but never changes the work result.

## Inspection

`project-governance telemetry status` reports:

- retained selection and closeout counts;
- selected events with and without a retained closeout;
- closeouts whose selection event has been evicted;
- utilization, influence, and task-outcome counts; and
- per-skill selected, reported, and status counts.

Interpret the summary with the repository diff, tests, review findings, and task handoff. A missing
closeout may mean the coordinator skipped the command, telemetry failed, or the selection event is
still open; it does not prove that a model ignored a skill. Retention eviction also prevents a
durable lifetime coverage claim.

## Privacy And Authority

Skill events reuse the ignored `.governance/telemetry/runs.jsonl` ledger and its 1,000-record bound,
concurrency-safe writes, re-sanitization, and fail-open behavior. They contain no prompts, paths,
commands, output, source content, skill bodies, provider identity, adopter identity, free-form
reasons, or private reasoning.

No receipt approves a change, weakens a check, promotes a skill, or authorizes repetition. Remote
export, scheduled collection, dashboards, and Project Gateway integration are outside this live
contract.
