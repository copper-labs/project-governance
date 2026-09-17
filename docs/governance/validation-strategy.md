---
id: governance.validation-strategy
title: Validation Strategy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-09-10
summary: Defines focused, impact-aware validation for the package runtime and its adopters.
---

# Validation Strategy

Validation should prove the change just made. It should not repeatedly run unrelated checks merely
because they exist.

## Normal Change Loop

1. Plan a bounded implementation batch that delivers an observable behavior or outcome.
2. Run focused checks at the planned development checkpoints.
3. Complete the batch, then perform its integrated proof and applicable independent QA.
4. Consolidate documentation and status, then commit the coherent result.

The planning agent owns the default batch size and test cadence. A batch can span shared code and
its affected host bindings when they implement one settled contract. Define its acceptance claims,
focused test checkpoints, expensive build point, review boundary, and reasons to split early.
Choose boundaries by dependency, uncertainty, risk, and reviewability; a file, helper, passing test,
or local recovery commit is not automatically a new QA or documentation boundary.

Size each batch to make meaningful progress without multiplying setup and review overhead or
making failures hard to isolate. Combine tightly related steps that share context and proof; split
unrelated outcomes or uncertainty that needs earlier feedback. Fixed file, line, or time quotas
are not a substitute for this judgment.

The writer completes the authorized batch without seeking approval for each internal step. Adjust
the planned checks when a failure, changed dependency, or newly discovered risk provides a concrete
reason. Escalate unresolved contracts or authority changes before dependent work; batching does not
defer necessary feedback or expand the approved scope. When delegation is used, coordinate on
completed batches, blockers, or material changes instead of repeatedly interrupting active work.

Group shared changes before expensive native or cross-platform rebuilds. Build earlier when a
compiler, ABI, host, or integration uncertainty needs resolving. Automated integration proof belongs
at the planned checkpoints; attended user testing belongs at the agreed acceptance milestone.
Serialize commands sharing mutable build outputs or devices; do not regenerate dependencies while
their consumers validate. Independent jobs with isolated inputs and outputs may run concurrently.

Capture command results as they occur in existing logs. Update plan checkboxes, status narratives,
evidence summaries, and explanatory documentation once at the batch boundary. Update a governing
contract or decision earlier when dependent work needs it, and keep documentation required for a
commit or delivery current. Report completed milestones and concrete blockers rather than inferred
completion percentages.

Reuse passing evidence only while its claim and relevant inputs remain valid, including source,
dependencies, configuration, toolchain, binary, environment, and expiry. An unchanged test file is
not enough. The build system owns reuse; this policy does not add a cache or waive required gates.

Read the complete diagnostic result before repairing a failed batch. Independent checks collect
findings in one invocation; do not launch every remaining pack separately to discover the next
failure. A short summary is not the complete finding inventory: follow checker-owned evidence
artifacts when results are sampled. Repair related findings together, then recheck the affected
owners. Stop writers before final sign-off so its source comparison can remain stable.

For a failed governance check, use the named pack at the same lifecycle stage and subject only when
focused diagnosis needs it:

```sh
project-governance check --pack <pack-id> --stage <failed-stage> --mode impacted
```

After the final repair, freeze the candidate and run one branch-aware local sign-off as the affected
recheck:

```sh
project-governance check --stage pre-push --mode impacted
```

Do not automatically run the named pack and then replay it immediately inside an unchanged
enclosing gate. If retrying `git commit` or `git push` will invoke that gate, the hook is the one
affected recheck; do not run the same stage manually first. A named pack remains available when its
faster feedback is useful during diagnosis, but that deliberate extra execution needs a concrete
diagnostic reason.

Pre-commit remains the staged changed-file hook; it is not a second completion boundary. The shipped
pre-PR hook names only the `pr-description` pack so authors can check the title and body without
replaying code validation. Do not run a separate full local pre-PR gate after the branch-aware
pre-push sign-off. CI may run its own affected gate as an independent environment and trust
boundary.

Prepare the authored commit message before the expensive staged gate. Check that draft through
`project-governance check --pack commit-message --stage commit-msg --commit-message-file <path>`,
then let `git commit --file <path>` invoke the one staged gate. This cheap narrative preflight avoids
replaying source validation merely to fix message structure. Prepare and check the PR narrative
before the final push for the same reason. Hook-triggered checks declare `--trigger hook`; manual
diagnosis and explicitly labeled tests remain distinguishable in telemetry.

The adopting repository owns its local-feedback objective and every command or job deadline. The
runtime records duration but does not infer failure from elapsed time or impose a generic default
timeout. A target or operator may supply an explicit deadline; expiration fails closed with timeout
evidence. When recurring local proof materially impairs the target's workflow, its owner decides
whether product builds, platform, device, or external-service execution belongs in CI or a
scheduled lane while preserving the required proof.

Freeze the completed batch before broad or cross-platform proof and perform one applicable
independent QA review at that boundary. An earlier review needs a named risk or unresolved decision.
An independent QA pass consumes that candidate and its existing proof; it does not replay the matrix.
It adds one focused check only for
a named changed seam with no evidence. One QA repair permits one affected deterministic recheck. If
that recheck fails, return to focused diagnosis or the operator instead of starting another general
QA, verifier, or broad-proof cycle.

## Long-Running Command Supervision

This policy owns direct-command supervision. The wheel's
[efficient execution resource](../../src/project_governance_runtime/assets/skills/resources/efficient-execution.md)
is its portable agent guidance. Existing selection, evidence reuse, diagnostic inventory, and
deadline rules above still apply. The [runtime specification](../specs/governance-kernel.md#selection-and-execution)
owns failure handling; compact output never changes which independent checks continue or which
dependents are blocked. The [provider helper contract](../specs/provider-agent-skills.md)
owns its job IDs, cursors, and wait limits.

For long-running proof, extend the existing proof budget with the canonical command and
prerequisites, wait strategy, estimated duration if known, explicit deadline if any, and evidence
location. Reuse runbooks instead of adding fields or per-step records. An estimate is not a deadline.

- Prefer completion-aware waits. For long commands, request 60 seconds where supported; otherwise
  use the longest wait compatible with the tool and higher-priority host instructions. Honor an
  applicable host preference for longer event-driven waits. Shorter waits need actionable input or
  a concrete intervention need. Required progress messages do not require extra status investigations.
- Retain the owning process handle for each active invocation. Empty logs or an expired wait are
  not process failure and never justify a duplicate, restart, or termination. Enforced deadlines
  and explicit cancellation remain effective; confirm terminal status before claiming an outcome.
- Do not end a working turn solely because authorized tests remain active. Continue useful work
  or wait on the same invocation. If a host interruption or user/authority boundary prevents that,
  preserve its handle, command/workspace identity, evidence path, and next action in the existing
  handoff when possible. On recovery, verify identity and handle validity; a lost handle is not
  proof of exit. Resolve status before rerunning, or report that it cannot be established.
- Keep permitted full diagnostic logs and machine receipts in existing target-owned artifacts,
  subject to redaction and retention policy. Return changed phase, terminal status, actionable
  failures, and evidence references. Aim for about 1,000 tokens per routine tool response where
  the host supports output limits; this is a soft target, not a runtime limit. Disclose omitted or
  truncated detail and expand it when diagnosis requires. Never hide a failure to meet the target.
- Diagnose before retrying and record a short reason in existing evidence: changed source,
  repaired environment, corrected harness, or a named diagnostic experiment. Preserve the failed
  attempt. Takeover, compaction, or elapsed time alone does not invalidate reusable proof; real
  expiry and other relevant input changes still do.

Review compliance once at the existing batch boundary using available execution records. Missing
records remain unknown. These instructions cannot mechanically enforce conversational behavior,
waive required proof, or establish token savings; field evaluation uses the existing Evidence rules.

## Selective Read-Only Support

Single-writer ownership does not serialize discovery or verification preparation. At batch
planning, identify zero to two useful independent reader assignments, their outputs, and when
answers are needed, or state a brief reason to work solo. Reassess at material blockers and long
operations rather than after every step. A reader must replace investigation the primary or
writer would otherwise perform, or address a concrete risk of rework. A second reader needs a
separate justification; the existing orchestrator need not create a manager role.

The installed delegated-execution skill owns assignment, communication, model-selection, and
reader boundaries. Readers consume existing evidence and do not edit Git or run commands that
mutate shared build/test state. Findings about unfinished work remain provisional. One independent
approval review on the frozen batch remains the review boundary; investigations do not add gates.
The primary reconciles findings and coordinates native and optional-helper jobs together.

Use existing logs for a small matched comparison of zero, one, and two readers when calibrating
the policy. Keep tasks, starting snapshots, writer settings, and acceptance checks comparable;
include rework and all participating agents' tokens. Repeat noisy comparisons before drawing
conclusions. The initial target is meaningful speed improvement with less than 25% median total
token premium; it is an evaluation preference, not an established optimum or blocking runtime
budget. Distinguish elapsed time from summed process durations, cached tokens from fresh input,
and monetary cost from token volume. Do not double-count reported reasoning tokens already
included in output. Missing usage remains unknown. No new collector or per-batch experiment is
required, and shipping the policy alone does not establish a measured improvement.

The [research basis](../reference/selective-reader-research.md) records the evidence and its limits.

## Publication Candidate

A publication candidate is one exact integration snapshot whose content is intended for release.
For a pull request, that snapshot is the proposed merge result: candidate content plus its current
integration base, not the branch head alone. An adopting repository applies this boundary to every
release kind it supports; `candidate` does not mean that the version must contain an `rc` suffix.
This runtime's own public releases retain the exact stable semantic versions defined by the
[release process](release-process.md).

The stable review candidate above becomes the publication candidate when release certification
begins. The one-recheck limit bounds an independent QA wave; it does not prevent focused release
repair on the candidate line.

The candidate boundary is operator-held, not runtime state. From candidate certification through
publication, keep the pinned governance runtime, required release checks, toolchain, and baselines
fixed. If one must change, form a new candidate. A freeze does not extend a waiver, dependency
freshness record, or other time-bound policy evidence beyond its real expiry.

Keep repairs on the candidate branch or equivalent integration line. During repair, replay the
failed owner and directly affected seam only. When the replacement candidate is stable, run the
complete declared release proof once before merge or tag. Integration must preserve the certified
content and base. If either changes, the integrated snapshot is a new candidate.

## Selection Rules

| Input change | Selected work |
| --- | --- |
| Applicable source file | Formatting, naming, maintainability, comments, test quality, and target-owned packs for that path |
| Governed documentation | Documentation governance |
| Context routes, skill catalog, root instructions, or provider adapters | Context routing and adapter-reference validation |
| Runtime lock, bootstrap, hooks, profile, facts, or extension registration | Installation validation |
| Enabled documentation profile or capability catalog | Existing documentation validation |
| Telemetry implementation or telemetry policy | Telemetry verification |
| Pack definitions, schemas, selectors, or extension registration | Validation conformance |
| Source file at commit time | Secret detection for changed files |

An unmapped path fails with one selector finding. It never causes all packs to run. Project build
systems retain responsibility for compilation, test caching, and device evidence.

Change-sensitive packs consume one runtime-resolved packet. Comment enforcement is full for new
files and new public or authority-boundary declarations; an existing declaration is reopened only
when its header or signature changes. Dependency freshness evaluates only coordinates added or
updated between the packet's before- and after-images. Existing comment debt and unchanged
dependency tuples do not become implementation scope.

Pre-commit secret proof deliberately includes bytes present only in the staged index. When the
secrets pack is selected, pre-push, deliberate full pre-PR, CI-PR, and release retain their declared
live publishable worktree-and-index secret surfaces and report no pack digest. The shipped narrow
pre-PR hook does not select the secrets pack. This difference is an explicit stage and selection
contract, not an inconsistency to normalize away.

## V1.1 Proof Rules

The completed V1.1 evidence-integrity plan's focused proof establishes:

- changed/staged checkers cannot substitute checkout bytes for packet materializations, while
  explicit all mode can read the checkout across declared scope;
- canonical `subject_digest` identity survives temporary-path changes and detects subject or
  materialization mismatch;
- process failure blocks even when child output claims an accepted, waived, or suppressed finding;
- a passed result may retain nonempty accepted, waived, or suppressed findings and exact numeric
  counts;
- lexical test-quality findings are advisory, while detector and process infrastructure failures
  block;
- a secret waiver matches one stable detector ID, path, after-image SHA256, owner, rationale, and
  expiry without exposing the secret;
- an optional evidence manifest is bounded, binds the immutable subject, rejects ambiguous input,
  and never resolves an artifact path or reads artifact content; no checkpoint or cross-pack
  composition behavior exists; and
- wheel inspection rejects concrete adopter/product identities and model invocation in governance
  checks; optional provider support has a separate, explicit import and execution boundary.

## Broad Proof

Run the complete suite only for a runtime release, a configuration-schema migration, a hook or
selection-contract change, a security/process-isolation boundary, scheduled reconciliation, or an
explicit operator request.

Delegation decisions belong to the host agent. Runtime validation proves repository checks,
process ownership, explicit deadlines, and bounded local telemetry. The optional provider helper
also needs deterministic native-protocol fixtures, process cleanup proof, and live provider tool
evidence. It never turns a model's review into a governance-check verdict.

## Evidence

Report the focused test, affected seam, selected packs, any intentionally omitted proof, and
residual risk. The JSON result contains normalized findings, status, execution duration, and
termination reason. The optional `--summary` projection keeps active findings while omitting
successful command detail and changed-path inventories. Bounded local telemetry adds changed-path
and selected-pack counts, total and slowest-pack durations, and one opaque digest for eligible
content-bound subjects without retaining paths, commands, output, prompts, or source content.
`project-governance telemetry status` summarizes unmatched starts, runtime
overhead, retained repeated scopes, same-subject repetition, broad runs, and slow packs as advisory
observations. It does not prove a repeat was unnecessary because invalidation reasons are not
retained. It also excludes direct commands and
native-host launches outside the runtime, so missing telemetry is never evidence that no work ran.

When investigating repeated work, use the on-demand `repeat_examples` in `telemetry status` to
locate original run results. Distinguish unavailable prior evidence, mechanical hook duplication,
and premature agent review boundaries before choosing an intervention. Same-subject observations
do not establish unchanged dependencies, tools, or environment. The view neither skips execution
nor runs automatically before checks.

Evaluate one targeted change at a time on representative tasks against current behavior, holding
acceptance quality and relevant model/host settings comparable. Include defects and rework alongside
available elapsed time and all-agent token use; inspect existing traces for the cause of a change.
Try advisory feedback before hard blocking unless the execution owner can prove the invariant.
Remove additions that fail to justify their overhead. This is targeted evaluation of a proposed
improvement, not a required experiment or reporting ceremony for every implementation batch.

Run deterministic builds through a target pack or the governed harness when one exists. If a
necessary command has no governed execution surface, report that coverage gap with the evidence
instead of silently treating runtime telemetry as complete.

At batch closeout, use existing logs or host/provider summaries to note available timings, review
rounds, rebuilds, and token usage only when useful for improving the next batch. Keep this in the
existing evidence summary; do not add per-step bookkeeping, new collectors, or a reporting gate.
Leave unavailable values unknown and compare cost with accepted outcomes and defects. Summed run
durations are not elapsed delivery time, and repeated calls alone do not establish wasted work.

## Compatible Runtime Lock Updates

A repository that opts into the [startup update contract](../specs/startup-runtime-updates.md)
receives verified candidate installation and ordinary commit-hook validation for each eligible
lock update. It does not repeat independent agent review or application-wide proof for that lock
change. Source releases retain independent QA and broad wheel proof. The updater joins its own
validation children to the held runtime lock; Git hooks never initiate update discovery.
