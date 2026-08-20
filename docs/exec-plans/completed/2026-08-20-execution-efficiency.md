---
id: exec-plan.execution-efficiency
title: Execution Efficiency Controls
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-20
updated: 2026-08-20
summary: Make repeated validation and ungoverned delegation visible while keeping one frozen-candidate proof cycle.
---

# Execution Efficiency Controls

## Final State

Governed work uses one bounded implementation loop, one stable-candidate proof cycle, and at most
one QA repair plus affected recheck. Native-host delegation passes through the existing route,
start, and finish boundary. Local telemetry summarizes repeated validation scopes and slow packs
without treating advisory measurements as policy or claiming coverage of commands run outside the
runtime.

This source work starts from `canonical/main@17d4ddc03b1d3709374430916562d9208738e033` on
`codex/governance-execution-efficiency`. It does not authorize publication, remote writes, releases,
or adopter changes.

## Fixed Decisions

1. Existing narrow-proof, one-wave authorization, and one-repair rules remain authoritative; this
   change makes them harder to bypass or misread rather than creating a second policy.
2. A native host launch is governed only when it uses the existing route/start/finish lifecycle.
   Direct host spawning is outside governance coverage and must not be presented as governed.
3. A QA finding permits one primary-owned repair and one affected deterministic recheck. It does
   not start another general QA, verifier, or broad-proof loop.
4. Telemetry remains ignored, local, bounded, redacted, advisory, and fail open.
5. Repeated scope fingerprints are observations, not proof of waste: the status output states that
   subject changes and invalidation reasons are not represented.
6. Direct build commands and native-host activity outside the harness remain excluded from runtime
   telemetry; status reports that boundary explicitly.

## Slice 1: Surface validation repetition

- Depends on: none
- Ownership: `src/project_governance_runtime/telemetry.py` and telemetry tests
- Execution: sequential
- Semantic contract: settled
- Required capability: primary
- Fixed decisions: summarize retained terminal runs, repeated scope fingerprints, broad runs, and
  slow packs without retaining paths, commands, output, or free text
- Acceptance: `telemetry status` exposes the bounded validation-efficiency summary and its coverage
  exclusions for populated and empty ledgers
- Focused proof: `python3 -m unittest tests.test_runtime_telemetry`
- Invalidates prior proof when: telemetry schema, sanitizer, aggregation, or status output changes
- Proof state: passed on the staged candidate with the focused telemetry suite
- Escalate or stop when: a useful metric would require source paths, commands, prompts, or durable
  product evidence
- Packet ready: yes

## Slice 2: Close native-host and QA-loop ambiguity

- Depends on: Slice 1
- Ownership: provider orchestration specification, validation strategy, installed workflow skills,
  and the canonical plan template
- Execution: sequential
- Semantic contract: settled
- Required capability: primary
- Fixed decisions: require the existing lifecycle for native launches; allow one QA repair and one
  affected recheck; prohibit a fresh general review or broad proof after each repair
- Acceptance: installed guidance, plan template, and specification state the same bounded lifecycle
  and telemetry boundary
- Focused proof: `python3 -m unittest tests.test_runtime_agent_contract tests.test_runtime_skill_payload`
- Invalidates prior proof when: installed skill payload or orchestration lifecycle wording changes
- Proof state: passed on the staged candidate with the agent-contract and skill-payload suites
- Escalate or stop when: a correction would require provider-specific runtime code or an adopter
  write
- Packet ready: yes

## Stable-Candidate Proof

Run the focused tests for each changed owner, then one directly affected package integration seam.
Do not run the broad wheel/release suite because this change does not alter a schema, release
artifact, process-isolation boundary, or selection contract.

Completed proof:

- `python3 -m unittest tests.test_runtime_telemetry`: 10 tests passed.
- `python3 -m unittest tests.test_runtime_agent_contract tests.test_runtime_skill_payload`: 12
  tests passed.
- `python3 -m unittest tests.test_runtime_package_execution.RuntimeExecutionTests.test_target_command_is_normalized_and_recorded`:
  the directly affected runtime-to-telemetry seam passed.
- `tools/run-source-governance.sh check --stage pre-commit --mode impacted --staged`: eight selected
  packs passed once on the staged candidate.
- The broad wheel/release suite was intentionally omitted under the validation strategy.

## Rollback

Revert the telemetry summary, its tests, and the matching Markdown/skill clarifications together.
Do not leave a status field or installed instruction without its owning documented contract.
