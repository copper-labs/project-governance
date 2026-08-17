---
name: module-authoring
description: Add, change, or retire a generic runtime capability or a target-owned validation extension without creating duplicate authority.
metadata:
  id: skill.module-authoring
  title: Module Authoring
  stage: Plan
  provenance: package-default
---

# Module Authoring

Keep the runtime small. A generic capability belongs in the package only when more than one target
needs the same behavior; a project-specific check stays with that project.

## Trigger

Use this skill when adding or retiring a built-in check, changing an extension boundary, or adding a
target-owned validation pack.

## Target Inputs

When present, read the target's `AGENTS.md`, `config/governance/profile.yaml`,
`config/governance/facts.lock.yaml`, and `config/validation/packs/`. They are project-owned inputs,
not package requirements.

## Workflow

1. State the capability, owner, inputs, output, and reason an existing check or pack cannot own it.
2. Keep generic runtime behavior in the package and project vocabulary, commands, and policies in a
   target extension.
3. Give each pack one purpose, selector, command, and bounded failure message. Do not add a second
   planner, cache, generator, or execution path.
4. Add only the focused behavior test and the directly affected integration seam.
5. For a target extension, register its pack in the target configuration and run it explicitly,
   followed by one impacted closeout check.
6. Retire obsolete behavior by deleting its code and references in the same change; Git history is
   the recovery path.

## Validation

Run the changed component's focused test, then `project-governance check --pack <pack-id>` for a
new or changed pack and one `--mode impacted` closeout check.

## Evidence

Report the owner, selector, command, focused proof, impacted closeout, and any target decision that
remains unresolved.
