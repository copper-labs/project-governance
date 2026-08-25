---
id: skill.context-router
title: Context Router
stage: Frame
provenance: package-default
---

# Context Router

Select and materialize the smallest useful storage-neutral context packet for a task.

## Trigger

Use this skill before substantial implementation, review, research, or authoring work when the
repository provides a generated context router.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- `docs/governance/context-routing.md`
- `docs/governance/context-routes.md`
- `config/governance/profile.yaml` context routing inputs
- `config/governance/context-provider-contract.yaml`
- `config/governance/context-packet.schema.yaml`

## Workflow

1. Classify the request by changed paths, artifact ids, product terms, and workflow terms.
2. Prefer the generated router command when available.
3. If no command exists yet, use the repository's profile routes and indexed route docs.
4. Resolve provider sources through the coordinator boundary and normalize them into packet items.
   Never place native queries, credentials, provider clients, or storage handles in the packet.
5. Materialize worker-readable representations under repository or ignored runtime paths, then
   write or preserve the full packet under the configured `.agent/` path.
6. Keep chat output compact: route id, confidence, provider ids, required items, degradation, and
   validation packs.
7. When `--save-miss` records a durable coverage gap, propose a redacted route and fixture in the
   target-owned `config/governance/extensions/manifest.yaml`. Do not edit the derived target
   profile or generated route docs directly; compose the reviewed change through the template
   upgrade lifecycle.
8. When `project-governance context` returns a `skill_utilization` identity, preserve that exact
   JSON result under ignored runtime state and carry it through work and proof. Do not reconstruct
   the selected skill set, its digests, or the utilization ID from memory.

## Validation

Run the context-router validation pack when configured. If routes conflict or no route matches,
report the ambiguity and choose the conservative broader context.

## Evidence

Report the selected route, provider ids, primary item refs read, omitted or secondary refs,
degradation reasons, and any router warnings.
