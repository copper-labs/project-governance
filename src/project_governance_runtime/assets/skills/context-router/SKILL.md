---
id: skill.context-router
title: Context Router
stage: Frame
provenance: package-default
---

# Context Router

Select and read the smallest useful packet before substantial task work.

## Workflow

1. Read the repository instructions and its `config/governance/profile.yaml` routing inputs.
2. Run `project-governance context --task "current objective" --emit-text`, adding
   `--changed-path <relative-path>` for known affected files. Read the returned source text.
3. Resolve required-source or required-skill blockers before implementation. A packet directory
   alone does not mean its contents reached the agent.
4. With optional Codex delivery enabled, the first prompt supplies the packet automatically.
   On a changed objective, run `project-governance context-delivery refresh --session-id <native-session-id>`
   before the next prompt, or explicitly resolve and read a fresh packet. Compact/resume replays
   only unchanged sources; an incomplete-context notice requires a fresh read.
5. For delegated work, resolve a child-specific packet and include the relevant actual text in
   the assignment. Root delivery does not prove child delivery.

## Optional JEV Setup

JEV is off by default. Project opt-in and developer readiness are separate. Only an explicit
`project-governance jev setup` sends a synthetic authentication probe using `JEV_TOKEN` from the
process environment. Never print or store the token. `jev status` checks local readiness;
`jev disable` revokes it. Missing readiness keeps ordinary local routing available.

Only project-allowlisted optional sources and explicitly authorized task text can leave the
machine. Start with shadow mode; it preserves the original packet. Required context and skills
are never scored or removed. Use `--semantic-off` for a local-only invocation.

## Evidence

Report route, required blockers, omissions and fallback reasons. Hook `submitted` means the runtime
returned the full packet, not that the model demonstrably received or obeyed it. Byte reductions
are estimates of payload opportunity, not actual billed LLM token savings. Consult the shared
semantic-context-selection specification for bounds and the evaluation/promotion contract.
