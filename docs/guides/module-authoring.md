---
id: guide.module-authoring
title: Pack And Extension Authoring
type: guide
status: current
owner: project-governance
created: 2026-08-04
updated: 2026-08-15
summary: Defines the small extension boundary for target-owned validation packs.
---

# Pack And Extension Authoring

Add a target-owned pack only when the project needs a check the generic runtime cannot own without
learning project vocabulary or tool paths.

## Decision Table

| Need | Owner |
| --- | --- |
| Generic formatting, naming, maintainability, comments, docs, secrets, dependencies, or test quality | Runtime wheel |
| Product build, test, platform, release, architecture, or observability check | Adopting repository |
| Different source roots, glob mapping, or command arguments | Adopting repository configuration |
| Generic runner behavior | Runtime wheel, with a focused generic test |

## A Good Target Pack

Each target pack has a stable identifier, clear selectors, one owning command, blocking or advisory
posture, and a focused test or fixture. It may depend on a generic pack but cannot silently replace
one. Its command must be runnable in the target repository without copied runtime code.

Every command emits exactly one JSON object on standard output with a string `status` and a
`findings` array. Status is `passed`, `warning`, `failed`, or `not-applicable`; each structured
finding declares one of `blocking`, `advisory`, `accepted`, `waived`, or `suppressed`. Wrap an
ordinary build or test command in a small target-owned adapter that converts its exit and evidence
to this envelope. A nonzero exit, timeout, interruption, malformed envelope, or unknown finding
state is a runtime failure and blocks regardless of the pack's advisory posture.

Do not create a marketplace, compatibility layer, or alternate policy authority. If two packs own
the same concern, consolidate them under the existing owner.

When selectors, schemas, or extension registration change, run the affected pack and one impacted
closeout. That is the correct scope for validation-conformance work.
