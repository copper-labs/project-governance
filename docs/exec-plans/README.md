---
id: exec-plans.index
title: Execution Plans
type: guide
status: current
owner: project-governance
created: 2026-02-16
updated: 2026-09-25
summary: Active and completed execution plans for the current source repository.
---

# Execution Plans

Active plans are short-lived work records. Completed plans retain concise source closeout context;
Git remains the implementation history and recovery mechanism.

## Active

- [RC7 prompt reliability](active/2026-09-25-rc7-prompt-reliability.md) separates preparation
  from JEV selection and refreshes context after explicit task changes without resetting spending.

- [RC6 maintained context](active/2026-09-23-rc6-linked-retrieval.md) owns automatic prompt entry,
  the local SQLite index, basic relationships, bounded JEV selection/expansion and real-task release
  qualification. Its expanded slices remain distinct from the earlier transient-index candidate.

- [Decision-layer delivery, release and pilot measurement](active/2026-09-21-major-adoption-and-measurement.md)
  is the finalized delivery order and progress checklist after explicit-preview closeout: implement useful JEV consumers,
  publish an RC, deliberately adopt it, compare real work with decisions off/enabled, and repeat for
  successive batches before the selected stable-major launch. The prerelease publication extension
  is proposed; existing release policy remains effective until changed.

- Supporting [decision-layer technical packages](../reference/2026-09-20-decision-layer-work-packages.md)
  preserve P0–P8 requirements and future qualification detail. They are a reference, not a second
  active plan, schedule or progress checklist. The S0–S10 plan above owns their delivery boundaries.

- [Unified development engine transition](active/2026-09-20-unified-development-engine.md) retains
  the E0–E5 requirements and explicit-preview implementation closeout. Its earlier pending entries
  are historical checkpoints. Use the adoption plan above for the next delivery sequence; preserve
  the [architecture decisions](../specs/unified-development-engine.md) and
  [migration category decisions](../reference/2026-09-20-engine-migration-inventory.md) as context.

- [Continuity agent handoff](active/2026-09-19-continuity-agent-handoff.md) records scope, evidence and the next authorized work boundary.

- [Decision-first development loop](active/2026-09-19-decision-first-development-loop.md) records
  the retained decision map and rationale. The [earlier adoption plan](../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md)
  supplies requirements carried into the unified transition; existing contracts govern current behavior.

- [Return test completion to the initiating agent](active/2026-09-10-test-completion-return.md)

- [Optional provider agent skills](active/2026-09-06-provider-agent-skills.md) builds and releases
  Gemini, Claude, and Codex wrappers independently of later implementation-plan improvements.

## Completed

- [Shared test execution](completed/2026-09-10-shared-test-execution.md) delivers deterministic
  batches, Codex and Claude CLI handoff, proactive skill routing, and bounded usage observations.
- [Efficient execution](completed/2026-09-10-efficient-execution.md) closes long-running command
  supervision gaps through existing policy and packaged skills.
- [Evidence-first efficiency](completed/2026-09-07-evidence-first-efficiency.md) adds on-demand repeat
  diagnosis and a project-wide principle of evidence-led simplicity.
- [Selective read-only support](completed/2026-09-06-selective-readers.md) adds bounded reader
  assignments to planning and a cooperating writer mode to the optional provider helper.
- [Automatic governance updates at top-level task startup](completed/2026-09-06-top-level-startup-updates.md)
  implements compatible updates with contextual worktree assessment and isolated local commits.

- [Lean Governance Operating Model](completed/2026-08-27-lean-governance-operating-model.md)
  removed the runtime control plane, bounded workspace and telemetry overhead, and aligned hooks
  with one affected local sign-off plus one narrow pull-request narrative check.
- [Commit and pull request change narratives](completed/2026-08-24-change-narrative-enforcement.md)
  installed and enforced compact product-level narratives and useful titles across commits and
  ready pull requests, followed by audited Claude Opus 5 reconciliation.
- [KMP Skill Library V0](completed/2026-08-24-kmp-skill-library-v0.md) delivered the governed
  seven-entry provider-neutral core, proactive matched-route selection, exact materialization,
  cross-provider evaluation, legacy-payload retirement, and clean-wheel proof. Publication,
  adopter changes, and the wearable overlay remain separately gated.
- [Reader-first authoring and on-demand developer documentation](completed/2026-08-21-on-demand-developer-documentation.md)
  delivered the minimal shared human and agent corpus, governed research handoff, exact routing,
  validation, telemetry, semantic pilots, Opus review reconciliation, and the `1.3.0` release.
- [Release candidate efficiency](completed/2026-08-20-release-candidate-efficiency.md) moved
  complete release proof before integration and kept repair loops on one stable publication
  candidate.
- [Temporary-waiver transitions](completed/2026-08-20-temporary-waiver-transitions.md) added one
  exact reviewed refresh path and one inert reviewed resolution exit for source-bound waivers.
- [Single affected sign-off](completed/2026-08-20-single-affected-signoff.md) made one branch-aware
  impacted pre-push pass the local completion boundary and made QA evidence-consuming by default.
- [Execution efficiency controls](completed/2026-08-20-execution-efficiency.md) closed the gap
  between narrow-proof policy, native-host delegation, and telemetry needed to spot repeated work.
- [Governance V1.1 evidence integrity](completed/2026-08-15-governance-v1.1-evidence-integrity.md)
  completed packet identity, finding lifecycle, exact waivers, bounded evidence indexing,
  telemetry, and clean-wheel proof.
- [Governance streamlining](completed/2026-08-14-governance-streamlining.md) completed its source
  implementation and proof. Any shadow adoption is target-owned work outside this checkout.

- [Ordinary task context and selection adoption](active/2026-09-22-task-context-entry.md) — post-RC4 integration repair under the major-adoption programme.
