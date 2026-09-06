---
id: exec-plan.top-level-startup-updates
title: Automatic Governance Updates At Top-Level Task Startup
type: exec-plan
status: completed
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Plan opt-in compatible runtime updates early in top-level tasks, allowing minor work while protecting substantial implementation already underway.
---

# Automatic Governance Updates At Top-Level Task Startup

## Final State

A newly started top-level task checks once for a compatible stable governance release. When the
repository has authorized automatic updates and its current work permits an isolated change, the
parent installs and verifies the release, commits the governance change locally, and begins or
continues the requested work using that exact version. Minor work already underway does not prevent
the update. A substantial implementation plan under execution retains its current version. Routine
updates require no repeated operator approval.

The parent interprets task scope and existing work. Runtime code verifies concrete preconditions
and performs the transaction. Subagents, delegated provider processes, resumed tasks, forks that
carry existing work, and compaction continuations never discover or initiate updates. They retain
the parent's version, or report a mismatch before continuing.

Non-goals: release-triggered fleet pushes; a scheduler, daemon, database, or task orchestration
service; automatic major upgrades; project configuration migrations; global provider configuration
changes; application-wide testing on each upgrade; automatic remote pushes; reading conversation
transcripts to infer ownership; replacing the current deliberate update command.

## Delivery And Authority

- Delivery: implementation and independent review complete for 2.5.0. Publication remains gated
  by candidate CI and the immutable release workflow.
- Source baseline: published 2.4.1, canonical commit
  `f8c909240efb094e7f9c3643a2670503ac1f399e`, verified against the remote reference.
- Implementation and reconciliation are committed in an isolated source checkout. Existing adopting repositories remain
  unchanged; each owns its separate one-time opt-in.
- Implement from the current canonical source when approved. Preserve unrelated work; the planning
  checkout is not itself a release candidate. Reconcile its plan index with the implementation base.
- Release classification: additive minor release 2.5.0, with automatic updates disabled until
  repository opt-in. Codex is enabled; uncertified providers remain manual.

## Research Findings

### Existing Runtime

The following observations refer to the source baseline, not a guarantee about every installed
adopter. Component paths identify the implementation owners.

| Current behavior | Consequence for this change |
| --- | --- |
| `installation.update` requires an exact version and changes only the tracked lock | Add discovery and safe automatic adoption without changing deliberate update semantics |
| The lock records the wheel digest, source commit, Python range, and configuration schema | Retain the exact lock as authority after automatic selection |
| Bootstrap verifies the wheel, then clears and reinstalls the existing environment | Reliable candidate installation and recovery must precede unattended updates |
| `materialize_skills` also refreshes managed root instruction sections | A nominal wheel update may touch tracked instructions; calculate the complete footprint before applying |
| Provider jobs hold a shared environment-use lock, and bootstrap takes an exclusive lock | Reuse this protection, but extend coverage to ordinary runtime readers and native parent tasks |
| Workers export `HARNESS_AGENT_ANCESTRY` for nested provider jobs | Every harness-launched provider is delegated, even when its native CLI starts a fresh session |
| `parent_job_id` also links follow-up jobs | That field alone cannot distinguish a root task from a worker |
| Release certification freezes governance, toolchain, checks, and baselines | Preserve certification and substantial implementation already underway; ordinary minor edits do not create a freeze |
| Hooks currently never upgrade, and adoption requires an operator decision | Amend the owning policies to allow a narrow, once-authorized startup path; Git hooks remain update-free |

Owning source: `installation.py`, `assets/tools/governance-bootstrap.py`, `harness_integration.py`,
`provider_agents/entry.py`, `provider_agents/jobs.py`, `provider_agents/worker.py`, `cli.py`, and
`configuration.py` under `src/project_governance_runtime/`.

### Host Support And Limits

These are documentation findings. Startup ordering, desktop behavior, and child exclusion still
need live conformance proof on the supported host versions before automatic application is enabled.

| Host or route | Verified documentation or source | Planned treatment |
| --- | --- | --- |
| Codex | `SessionStart` distinguishes startup/resume/clear/compact; `SubagentStart` is separate; hook context can reach the model; hook definitions require trust | Use the startup event only after proving root-only delivery, instruction timing, and desktop/CLI behavior. Do not assume the desktop and shell CLI use the same version. [C1], [C2] |
| Claude Code | Startup, resume, clear, compact, and fork are distinct; `agent_id` identifies child calls; `agent_type` can also describe a top-level custom agent | Use startup plus child exclusion. Never treat an agent type name as proof of delegation. SessionStart is context-only, so the parent must consume the outcome before substantial implementation. [A1] |
| Harness-launched Codex, Claude, or Gemini | The worker supplies enclosing ancestry before launching the native provider | Reject automatic discovery and application before network access. Carry the exact parent runtime identity in assignments and follow-ups |
| Gemini through Antigravity | Its documented hooks include `PreInvocation`, but no SessionStart event or explicit parent/root field in the common payload | Keep automatic application disabled until a supported launch path proves root identity and new-task semantics. Do not add a check on every model invocation. [G1] |
| Other launch paths | No verified root identity or lifecycle contract | Return a local unsupported/deferred result; do not infer root identity from missing environment variables |

The separate Gemini CLI has its own lifecycle hooks. It is not the existing Antigravity adapter,
and substituting it would be a provider migration outside this plan. [G2]

Codex assembles startup instructions before ordinary agent work. The design must not assume that
editing AGENTS.md reloads them. Keep the startup pointer stable and load versioned resources after
the update. If already-loaded instructions, hook definitions, or discovered capabilities must
change, require a verified host refresh or fresh session before work continues under the new
version. [C2]

## Proposed Operating Contract

### Authorization And Task Entry

1. A repository opts in once through its tracked governance profile. Proposed values are
   `runtime_updates.policy: manual | compatible`, with `manual` as the default. Compatible mode
   authorizes an isolated local upgrade commit, subject to the current task and host permissions.
2. A small stable host entry point normalizes the event into provider, task id, parent identity,
   event kind, canonical worktree identity, and available permission information. Native child
   events and harness ancestry return immediately, before release discovery.
3. The startup hook performs bounded preparation and supplies a compact result to the parent.
   The parent uses the first request and existing work to decide whether application is appropriate.
   A read-only task, plan-only host mode, or explicit operator prohibition defers mutation even
   when repository policy normally allows it. No extra model call or agent is needed for assessment.
4. The parent calls the shared apply operation early in the task, before substantial implementation
   is underway. Investigation, planning, and minor edits may already have happened. Reassess the
   current work at application time; the fact that a file changed after discovery does not itself
   require deferral. The assessment cannot override migration, ownership, integrity, commit
   isolation, or runtime-use restrictions.
5. Duplicate startup delivery is idempotent for the same provider/task/worktree identity. A new
   turn, child process, worktree switch, resume, fork, or compaction is not a new update opportunity.

Use a normalized event supplied by a supported adapter and a matching local startup receipt.
An arbitrary `--role parent` argument is insufficient. This is an operational guard between
cooperating tools, not a security boundary against a process with the user's filesystem access.
Unknown or contradictory identity always prevents automatic discovery/application.

On resume, verify the retained version against the current lock without contacting releases. If
another authorized operation changed it, report a version mismatch and require a fresh context or
explicit reconciliation; do not silently run old instructions against new tools. A worker in a
different worktree with a different lock returns the mismatch to its parent without upgrading it.
Missing worker installations also return to the parent; workers do not bootstrap around this rule.

### Worktree Assessment

The parent judges whether changing governance would disrupt a substantial implementation plan
already being executed. It uses the existing plan and task context; no new approval gate, scoring
system, file-count threshold, or time limit is needed. An unstarted plan or a few implementation
edits do not establish a freeze. Relevant evidence includes coupled batches or agents already
executing a settled contract, and integrated proof or review that depends on the current rules.

For example, a documentation correction, a small isolated bug fix, or minor edits made while the
version check completes can remain eligible. A cross-platform migration or broad refactor already
being delivered under a coordinated plan should keep its current governance version. Review and
release certification retain their existing stable-candidate boundary.

| Situation | Default decision |
| --- | --- |
| New task, attached branch, initialized repository, no competing use | Eligible for compatible update |
| Investigation, planning, or minor implementation already underway | Eligible after checking actual overlap and proof dependencies; do not defer merely because work has started |
| Unrelated unstaged edits, including unrelated untracked files | Eligible only when the complete update and validation footprint is separate and existing bytes remain untouched |
| Unrelated staged changes | Eligible only when a path-specific commit and its hooks demonstrably preserve the existing index and pending changes; otherwise defer for that concrete limitation |
| Dirty lock, profile, relevant packs, launchers, managed instruction sections, or hook configuration | Defer because the upgrade overlaps its own authority or proof inputs |
| Another task, queued/running provider job, or runtime check uses the same runtime | Defer; never cancel another task to make room |
| A substantial implementation plan is being executed, or a candidate is under review/certification | Defer when the update would change the rules beneath that work, even if Git reports a clean checkout |
| Merge, rebase, cherry-pick, revert, sequencer operation, or unresolved conflict | Defer |
| Detached HEAD, unborn branch, read-only checkout, shared/external runtime, unsupported filesystem layout | Defer with an exact reason |
| Governance source checkout | Use the source workflow; do not replace it with an adopter installation |
| Missing/broken current installation or interrupted prior update | Diagnose/recover first; do not present this as an ordinary compatible upgrade |

Resolve Git common-directory and worktree identities through Git, and canonicalize filesystem
aliases. Use the worktree-local lock and environment; never update sibling worktrees or the common
repository implicitly. Existing Git locks are evidence of competing work, not files to remove.

Before mutation, retain the branch/HEAD, index identity, relevant configuration and launcher
digests, exact update paths, and the existing modified-file inventory. Recheck under ownership
immediately before activation and commit. If minor unrelated edits or a local commit appeared
during discovery/preparation, refresh the assessment and snapshot while retaining valid artifact
verification. Do not automatically abort, restart discovery, or rerun unaffected proof. A changed
update footprint, active substantial plan, or uncoordinated writer still prevents mutation until
resolved. Use Git-aware path handling, including literal and NUL-delimited paths. Do not stash,
reset, amend, switch branches, or broaden the commit to make an update fit. Unrelated edits need
no automatic documentation or source cleanup.

### Release Discovery And Eligibility

- Discover from the repository's configured distribution owner. Select the highest supported
  stable semantic version within the current major. Exclude drafts, prereleases, malformed tags,
  and downgrades. A newer major can be reported without hiding updates on the current major line.
- Query published releases with bounded pagination. GitHub's latest-release endpoint alone cannot
  establish the newest compatible release on an older major line. If the bounded search is
  incomplete, say so rather than claiming the repository is current. [R1]
- Cache release metadata locally by distribution identity, installed lock, and policy. Cache
  discovery only; never reuse a prior worktree-safety decision. A proposed 12-hour cache and
  5-second discovery budget should become explicit, configurable startup policy defaults.
- Add one immutable `runtime-update.json` release asset, bound to the exact target version and
  lock SHA256. It declares automatic eligibility, supported source-version range, configuration
  schema, minimum bootstrap contract, and any required manual integration or context refresh.
  This is compatibility metadata, not executable migrations or a second runtime authority.
- Missing/unknown metadata means manual adoption. A supported source range must account for
  intervening migrations; equal current/target schema numbers alone cannot approve skipping them.
  The release pipeline validates this declaration, and review owns its semantic accuracy.
- Verify the configured repository, stable release identity, asset digests, lock/wheel agreement,
  package identity, Python support, and immutable-release status. Never trust release prose as a
  command or follow a candidate to a different release owner without explicit configuration.
- Reuse current authentication without writing secrets into receipts. Network/authentication
  failures leave the working version usable and do not launch a retry loop.

### Installation, Commit, And Recovery

The current in-place bootstrap is unsuitable for an unattended transaction. Prefer installing each
candidate at its final digest-specific environment path and retaining `.governance/runtime` as the
stable active pointer. The lock remains the sole durable version authority; retained environments
are installation artifacts. Python virtual environments cannot safely be prepared elsewhere and
then treated as freely relocatable because scripts contain absolute paths. [P1]

The first enablement must migrate the existing real runtime directory deliberately, with exact
rollback to its original path. Prove this migration before enabling startup application. Update
runtime path validation and environment-use locking: `provider_agents/entry.py` currently infers
its lock location from the resolved environment directory being named `runtime`.

Proposed transaction:

1. Validate identity, policy, release eligibility, worktree assessment, and intended file footprint.
   Prepare the commit narrative before expensive proof. Check signing/identity availability without
   changing the user's Git configuration.
2. Download verified artifacts and install the candidate into its final inactive environment.
   Materialize skills there without writing live root instructions. Refactor the existing combined
   skill-materialization/instruction-refresh operation to support this separation.
3. Run candidate package/version and dependency checks, then verify target configuration against
   the candidate in a read-only preview. Preflight must not alter target-owned files.
4. Acquire exclusive update ownership and environment-use protection; recheck the snapshot and
   other task reservations. Write a small ignored recovery journal containing only identities,
   expected digests, prior pointer/lock, and transaction phase.
5. Activate the candidate and write the new lock. Automatic compatible updates initially permit
   a lock-only tracked change; instruction/hook/launcher migrations take the deliberate path.
   The journal and entry guard cover the interval because Git and filesystem changes cannot be
   committed as one atomic operation.
6. Run candidate doctor and the affected installation check, followed by the normal commit hooks.
   Candidate checks and commit hooks must join the updater's transaction without deadlocking on
   its exclusive lock. Other readers must not observe a half-applied version. Prove this explicitly.
7. Commit the exact prepared path set with an authored outcome and rationale. Keep ordinary hooks
   and signing enabled. Git supports path-specific commits, but the updater must still inspect the
   resulting commit tree and preserved index rather than trusting command success alone. [V1]
8. Read back the commit, lock, active environment, runtime version, and materialized guidance.
   Only then record `updated` and begin or continue work under the new version. Preserve minor
   work that preceded the update; reassess only evidence affected by changed governance behavior.

Failures before activation leave the current lock/environment untouched. Before a commit exists,
restore only updater-owned changes whose identities still match the journal; preserve independent
edits. Once the commit exists, recover toward that committed lock. Never rewrite HEAD automatically.
If another writer or hook changed state unexpectedly, preserve evidence and report recovery-required
instead of claiming a clean rollback or starting implementation on an inconsistent installation.

Retain the previous working environment for recovery. Reclaim only unreferenced updater-owned
artifacts after proving they are not in use. Do not build a global cache or delete unknown state.
Wheel identity does not freeze every transitive pip dependency in the present runtime; this work
must not claim that it does or quietly introduce a separate dependency-locking project.

### Shared Runtime Use And Minimal Local State

Reuse the existing provider environment lock. Add a short transaction lock and minimal task
reservations for participating native parents, keyed to the canonical runtime and worktree. Each
reservation records only host/task identity, pinned lock digest, and lifecycle/ownership information.
No prompt, transcript, task-content database, periodic heartbeat, or model-driven scheduler belongs
in this feature.

The first implementation batch must prove how each host establishes and releases a reservation.
SessionEnd is not universally equivalent to task completion. Expiration alone must not declare
another task safe to interrupt. Recover abandoned reservations only from positive lifecycle or
process evidence; defer on ambiguity. Bound reads and retained inactive records. Failure to prove
coverage for existing/unmanaged users of the runtime prevents automatic application for that route.

Extend the same runtime-use guard to normal CLI readers before replacement-sensitive imports.
Child launches inherit the parent's lock digest and a delegated marker, including cross-provider
launches and follow-ups. A changed version must not create a child-specific update decision.

### User Experience And Cost

Normal outcomes are `current`, `updated`, `deferred`, and `approval-required`. An inconsistent
installation additionally reports `recovery-required`; it must never be hidden as a harmless
deferral. Results name the installed/candidate versions, one reason, and the commit when applicable.

Current or deliberately disabled checks stay quiet. Successful updates get one concise line.
Deferrals report once when useful and do not become repeated permission questions. Major releases
and migrations include an exact next step. No per-file QA or explanatory documentation update is
part of routine automatic adoption; the isolated commit supplies the durable history.

Proposed performance objectives: no provider or model calls; zero network requests for children,
continuations, and a valid metadata cache; a subsecond cached local decision on a small repository.
The cold discovery budget is configurable. Installation and target hooks use the adopter's explicit
deadlines. These are design targets, not measured claims. Use existing command timing and receipts
to evaluate cost; do not expand validation telemetry into a new monitoring system.

## Batch 1: Prove Startup Ownership And Settle The Contract

- Depends on: operator approval of this plan.
- Ownership: startup adapters, bounded host conformance fixtures, and the new startup-update
  specification. Update CHARTER, architecture, bootstrap, release, validation, and provider-agent
  contracts together where they own authority. Keep provider files thin.
- Execution: sequential; no independent implementation lanes until the shared contract settles.
- Semantic contract: proposed; root identification, instruction loading, and reservation lifecycle
  are unresolved integration claims.
- Fixed decisions: top-level new tasks only; no worker discovery; no remote publication; opt-in;
  exact locks; automatic major/migration exclusion; no transcript inference or persistent service.
- Acceptance: document and demonstrate event identity and ordering for each claimed host, including
  native children, harness children, resumes/forks, changed guidance, and another open task. Prove
  initial hook trust and the quiet enablement boundary. Finalize the host support matrix and schema.
- Development checkpoints: one table-driven event-normalization suite after the event contract is
  drafted; bounded host probes once the candidate adapters exist. Use disposable repositories.
- Build and integration point: one minimal wheel/host fixture at the end of the probe, before the
  shared updater depends on an assumed lifecycle signal.
- Review boundary: one architecture/QA review of the settled contract and probe evidence. Review
  resolves specific unknowns; it does not rerun all provider capabilities.
- Proof budget: one small new-root/child/resume/concurrency sequence per claimed host; no general
  provider benchmark. Exact runtime and model costs remain unknown until measured.
- Invalidates prior proof when: host versions, event fields, launch paths, context ordering, trust,
  or ownership semantics change.
- Proof state: documentation/source research complete; live conformance not run.
- Split early or stop when: a required host cannot prove top-level identity or safe activation
  without recurring overhead. Keep it disabled and bring the support limitation to the operator;
  do not substitute a different provider or weaken child exclusion.
- Documentation: write the governing contract before dependent code; consolidate findings once.
- Acceptance milestone: operator review only if the supported-host scope materially changes.

## Batch 2: Deliver One Safe Compatible-Update Transaction

- Depends on: Batch 1.
- Ownership: shared release discovery, compatibility policy, installation/recovery, Git commit
  isolation, runtime-use guards, and their integrated fixtures. Suggested modules are `updates.py`,
  `update_transaction.py`, and a small shared runtime-use owner; adjust boundaries by responsibility.
- Execution: sequential shared implementation; treat installation and commit as one outcome.
- Semantic contract: settled by Batch 1 before mutation code is written.
- Fixed decisions: inactive candidate installation; exact release provenance; one lock-only local
  commit; normal hooks; preserve unrelated work; no autonomous migrations or branch manipulation.
- Acceptance: a disposable adopter upgrades and commits successfully, including with isolated
  minor work already underway and unrelated staged changes preserved; every injected failure
  preserves or recovers a truthful lock/environment pair; children and competing users cannot
  trigger an update or observe partial activation.
- Development checkpoints: discovery/policy tests after selection is coherent; installation and
  Git fault-injection tests once the whole transaction exists. Rerun only the affected failure cases
  during repair. Existing installation and harness tests cover directly changed contracts.
- Build and integration point: one wheel-to-adopter integration with real Git hooks, a private-
  release HTTP fixture, environment-pointer migration, and interruption recovery.
- Review boundary: one independent QA pass on the completed shared transaction and its evidence.
- Proof budget: one focused suite and one integrated transaction matrix on the stable batch; no
  application builds or full repository suite during internal steps.
- Invalidates prior proof when: selection, manifest, bootstrap, path safety, concurrency, recovery,
  commit behavior, dependencies, or test host changes.
- Proof state: not-run.
- Split early or stop when: reader/commit-hook locking deadlocks, recovery can overwrite unrelated
  work, or the environment layout requires an unplanned compatibility break.
- Documentation: update command/reference and recovery guidance at batch closeout.
- Acceptance milestone: automated integration proof; no attended adopter testing yet.

## Batch 3: Enable Supported Hosts And Prove Delivery

- Depends on: Batch 2.
- Ownership: stable host entry files, shared startup resource/skill, doctor reporting, profile
  opt-in, release metadata generation, documentation routing, and source release workflow.
- Execution: sequential integration over the shared implementation.
- Semantic contract: settled; adapters may normalize events but may not invent update policy.
- Fixed decisions: preserve authored provider configuration and hooks; no global installation;
  bootstrap once for initial enablement; unsupported hosts remain explicitly disabled.
- Acceptance: a supported new top-level task updates early, including after minor edits, while
  substantial implementation already underway defers the update; native and harness
  children make zero discovery requests; continuations keep their version; custom hooks and
  unrelated edits survive; major releases and migrations produce one actionable notice.
- Development checkpoints: managed-hook merge and doctor tests after host wiring; then one live
  acceptance sequence per supported host using the stable wheel. Reuse Batch 1 fixtures and
  unchanged Batch 2 proof rather than running every intermediate milestone again.
- Build and integration point: stable wheel, clean installation, Linux/macOS ownership/recovery
  tests, and initial real-directory migration. Automatic updates on other platforms remain disabled
  until their filesystem and locking contracts have evidence.
- Review boundary: one independent QA review of final integration, existing proof, and release
  compatibility declaration. Any repair gets an affected recheck.
- Proof budget: one complete source-readiness cycle for the stable release candidate, one host
  acceptance sequence per supported route, and one attended operator walkthrough at the end.
- Invalidates prior proof when: wheel bytes, base commit, launcher/hook definitions, supported host
  versions, installation layout, or compatibility declaration changes.
- Proof state: not-run.
- Split early or stop when: a host needs new trust on every ordinary runtime update, setup mutates
  authored content, or the initial enablement cannot preserve active work.
- Documentation: consolidate operator instructions, support limits, plan status, and release notes
  at closeout. Register the new capability in the existing developer catalog.
- Acceptance milestone: operator observes current/update/defer/major flows in a disposable adopter;
  separately authorize any real-repository enablement or publication.

## Acceptance Matrix

| Claim | Cheapest sufficient proof |
| --- | --- |
| Only new top-level tasks discover updates | Event fixtures plus a counting HTTP endpoint; native child, external worker, nested worker, resume, clear, fork, compaction, duplicate event, and unknown identity cases |
| Parent and workers retain one version | Assignment/follow-up fixtures and one native child check of lock/guidance digests; different-worktree mismatch returns to parent |
| Compatible selection is correct | Stable/prerelease/draft, two-digit minor, current-major patch after newer major, absent metadata, intermediate migration, unsupported Python, changed artifact, wrong owner, pagination, offline/auth/cache cases |
| Existing work survives | Real Git fixtures for unrelated dirty/untracked files, staged changes, linked worktrees, path aliases, filenames with brackets/newlines, detached/unborn/conflicted/sequencer states, and competing writer |
| Minor work does not cause unnecessary deferral | Allow an isolated small fix, an unstarted plan, and unrelated edits or a local commit completed during discovery; preserve staged changes; reuse valid artifact proof after refreshing the snapshot |
| Substantial execution remains stable | Defer for a coordinated implementation plan underway and for review/certification, including a clean worktree; the parent explains the actual dependency on the current version |
| Update is recoverable | Faults at download/install/materialization/preview/swap/lock-write/hooks/commit/readback; terminate the updater between phases; assert lock, runtime, HEAD, index, and unrelated bytes |
| Readers cannot see a partial update | Concurrent ordinary check, queued/running provider job, another native parent, two startups, and commit-hook re-entry |
| Updated guidance actually reaches the agent | Host probe with an observable version-specific instruction; verify startup pointer stability and explicit refresh/restart behavior |
| Local commit is isolated and honest | Exact changed tree paths, parent commit, preserved index, signed-commit/identity failure, hook rejection and hook mutation; no push |
| Startup cost stays small | Network and process counts plus existing elapsed-time logs; no model call on the updater path and no polling on child/continuation paths |

## Stable-Candidate Proof

The owning runtime packs include `documentation`, `format`, `context-router`, and the installation/
runtime suites selected for the changed components. Use actual planner output to select any
additional owner; do not create a new validation gate simply for automatic updates.

For this planning-only change, run the documentation check and impacted planning on the two
authored documentation paths. Do not run runtime tests or install into adopters to validate prose.
Use a temporary Git index for a staged documentation snapshot when the checker requires it;
preserve the user's real index and all unrelated changes.

For implementation, freeze each coherent batch before independent QA. Retain valid focused proof
and close only its missing integration claims. At release, follow the existing source-readiness
workflow once on the stable proposed merge result, including full tests, built-wheel boundary,
clean installation, and platform proof. Existing review/readiness evidence is not repeated without
an invalidating change. Remote merge/tag/release requires explicit authorization.

## Rollback And Rollout

Policy can be returned to `manual` without uninstalling governance. A failed uncommitted update
restores only its own verified state; a committed upgrade is reverted through a new ordinary
commit and a deliberate bootstrap to that lock. Keep parent contexts aligned with the resulting
version. Do not create a compatibility shim or a second active version authority.

Initial enablement is a deliberate upgrade to a runtime that contains this feature, installation of
the stable startup integration, host trust where required, and one profile opt-in commit. Existing
older runtimes cannot discover a feature they do not have. A later explicitly authorized bulk
enablement can reduce that one-time administration; no adopter inventory belongs in this checkout.

## Review Highlights And Remaining Decisions

Recommended: opt-in compatible updates, a local lock-only commit, contextual worktree assessment,
strict child exclusion, stable startup hooks, and three coherent batches. Minor work already
underway remains eligible; a substantial implementation plan under execution is the development
freeze boundary. Routine updates should require neither an independent agent review nor a full
application test run.

The first batch must settle two material uncertainties before mutation code depends on them:
supported host/root identity and lifecycle coverage; safe instruction activation in the same task.
Antigravity currently lacks sufficient documented startup/parent fields for an automatic-application
claim. An adapter should remain disabled if its bounded probe cannot establish those properties.

The installation/commit transaction is the largest implementation component. Treat its recovery
and concurrency proof as required behavior, not optional infrastructure. Keep the rest to a small
policy, stable adapters, shared updater, and bounded local files.

## Implementation Closeout

The three implementation batches delivered shared discovery and compatibility, recoverable
installation and isolated commits, then Codex integration, worker bindings, and release proof.
The source remains product-neutral. No adopting repository was changed or opted in.

Independent Codex review identified four actionable boundaries: exact prepared lock readback after
Git hooks, reservations for concurrent starts and continuations, worker inheritance across
worktrees, and interruption before the initial runtime directory rename. Regression fixtures and
review reconciliation cover each boundary. A follow-up checked inherited pins before unmanaged
fallback. Clean installed proof exposed and resolved a macOS nested-venv executable link cycle.

The owning startup suite covers these repairs. The provider suite passes. Clean-wheel proof covers
one-time enablement, candidate installation and activation, ordinary commit-hook execution, and
preservation of unrelated staged and unstaged work. Existing passing owner proof is reused where
its inputs remain unchanged; final source-readiness CI validates the publication candidate.
The published release, immutable asset digests, and its completed workflow provide delivery
readback rather than this plan asserting publication in advance.

Codex native probes establish distinct parent/child events and inherited startup context, including
session-end behavior in the bundled host. The older CLI lacked that end event, so explicit task
closeout and positive process identity remain necessary. Claude startup ran but its child probe
was quota-blocked; automatic adoption stays disabled. Antigravity remains manual because its
native hook contract lacks the required parent identity. These are explicit support limits.

Ordinary compatible updates contain no additional model call or independent agent review.
The local lock commit is the durable update record. Documentation and source status were closed
at implementation-batch boundaries; no collector, scheduler, or periodic reporting system was added.

## Research Sources

Public documentation consulted on 2026-09-06. Provider behavior must also be verified against the
host versions supported by the eventual release. Source inspection alone is not live host proof.

- [C1: OpenAI hook lifecycle, trust, context, and event fields](https://learn.chatgpt.com/docs/hooks).
- [C2: OpenAI instruction discovery and reload behavior](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- [A1: Claude Code hooks, child identity, and SessionStart behavior](https://code.claude.com/docs/en/hooks).
- [G1: Antigravity hook events and common input fields](https://antigravity.google/docs/hooks/).
- [G2: Separate Gemini CLI lifecycle hooks](https://geminicli.com/docs/hooks/reference/).
- [R1: GitHub published releases, pagination, and asset metadata](https://docs.github.com/en/rest/releases/releases).
- [P1: Python virtual environment portability](https://docs.python.org/3/library/venv.html).
- [V1: Git path-specific commits and pathspec handling](https://git-scm.com/docs/git-commit).

[C1]: https://learn.chatgpt.com/docs/hooks
[C2]: https://learn.chatgpt.com/docs/agent-configuration/agents-md
[A1]: https://code.claude.com/docs/en/hooks
[G1]: https://antigravity.google/docs/hooks/
[G2]: https://geminicli.com/docs/hooks/reference/
[R1]: https://docs.github.com/en/rest/releases/releases
[P1]: https://docs.python.org/3/library/venv.html
[V1]: https://git-scm.com/docs/git-commit
