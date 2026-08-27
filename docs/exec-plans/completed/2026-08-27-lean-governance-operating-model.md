---
id: exec-plan.lean-governance-operating-model
title: Lean Governance Operating Model
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-27
updated: 2026-08-27
summary: Align runtime selection and shipped hooks with one affected local sign-off and one narrow pull-request narrative check.
---

# Lean Governance Operating Model

## Intended Result

Routine work has one fast staged check while editing, one branch-aware affected sign-off before
push, and one independent CI boundary. Preparing a pull request checks only its title and body; it
does not replay the affected local sign-off. Release remains the only ordinary all-pack broad
boundary.

The runtime makes this model reliable by preventing a selected pack from passing without running a
command and by allowing a named pack to retain an explicit lifecycle stage and change scope.

This plan changes only `project-governance`. It does not authorize adopter changes, publication,
remote writes, tags, or a runtime release.

## Starting Point

- Source baseline: `canonical/main@d29f0e38e89043d241d35750db29b53f681ab863`.
- Work branch: `codex/governance-recovery-efficiency`.
- A reviewed, uncommitted Slice 1 candidate already exists in the isolated worktree. It is not an
  approved release and may still be reduced while implementing this plan.
- The existing validation strategy already names pre-push as the one local completion boundary,
  but the shipped pre-PR hook still runs every impacted pre-PR pack.
- A named `--pack` currently cannot be combined with `--stage` or changed-scope selectors. This
  prevents the pre-PR hook from asking for only the `pr-description` pack at the `pre-pr` stage.

## Fixed Decisions

1. `pre-commit` is the staged inner-loop check. It is not a completion boundary.
2. `pre-push --mode impacted` is the one local code-validation sign-off on a stable candidate.
3. The shipped `pre-pr` hook validates only the pull-request title and body. It is an authoring
   check, not another code-validation gate.
4. `ci-pr` is an independent environment and trust boundary. It may repeat affected proof for that
   reason, but local review and QA do not replay it.
5. `release --mode all` remains the broad certification boundary.
6. Pack selection, lifecycle stage, and change scope are separate inputs:
   - `--pack` chooses the pack;
   - `--stage` chooses applicable commands;
   - `--mode`, `--staged`, `--changed-path`, and `--base-ref` choose the subject.
7. Project build systems continue to own test selection, sharding, caching, devices, and retries.
   The governance runtime will not duplicate them.
8. A selected blocking pack can never report success when it resolved no runnable command.
9. The adopting repository owns local-feedback objectives plus command and CI deadlines. The
   runtime records duration, imposes no generic default timeout, and fails closed when a target or
   operator explicitly supplies one.
10. Agents share the current checkout by default. Delegation does not authorize another worktree;
    only a direct operator request does.
11. The runtime reclaims only inactive empty run and pack scaffolding that it owns. An active marker
    protects concurrent work; target-written evidence remains target-owned and is never deleted.
12. Full machine receipts remain available, while normal hooks and operator inspection use a
    compact projection that retains failures without embedding successful command output.
13. Local telemetry remains bounded, ignored, content-free, and advisory. One opaque subject digest
    is enough to observe same-candidate repetition across lifecycle stages without retaining paths,
    content, or command output.
14. Because `1.4.0` exposed the agent-routing and skill-closeout commands removed by this plan, the
    next stable release is `2.0.0`. Do not restore compatibility shims or label the breaking
    simplification as a minor release.

## Explicit Non-Goals

- No governance result cache, resume database, receipt-reuse protocol, approval ledger, or proof
  registry.
- No scheduler, generalized sharding framework, dynamic workflow generator, or duration predictor.
- No automatic retries, circuit breaker, merge queue, or new persistent runtime state.
- No new risk taxonomy, review role, approval form, policy record, or overlapping guide.
- No removal of the generic `pre-pr` stage; adopters may still use it deliberately. Only the
  runtime's shipped default hook becomes narrative-only.
- No change to product test commands, platform matrices, or adopter-owned validation packs.
- No automatic worktree creation, worktree cleanup command, evidence retention policy, or adopter
  workspace mutation.

## Slice 1: Eliminate false-green pack execution

**Owner:** command resolution, planner, executor, configuration loader, doctor, runtime tests, and
the kernel specification.

**Files:**

- `src/project_governance_runtime/execution_commands.py`
- `src/project_governance_runtime/planning.py`
- `src/project_governance_runtime/execution_flow.py`
- `src/project_governance_runtime/configuration.py`
- `src/project_governance_runtime/cli.py`
- `tests/test_runtime_package_planning.py`
- `tests/test_runtime_package_execution.py`
- `docs/specs/governance-kernel.md`

**Changes:**

- Identify declared pack stages with no applicable command.
- Make `doctor` report malformed pack YAML and stage-command gaps plainly.
- Block planning when a selected blocking pack has no command for the requested stage.
- Fail a pack at execution if placeholder resolution or another late condition still produces zero
  runnable commands.
- Preserve advisory-pack semantics: report a warning and continue to later packs.

**Acceptance:**

- The planner cannot return a ready blocking pack for an uncovered declared stage.
- An explicit named diagnostic with no stage remains usable.
- A zero-command blocking pack fails; a zero-command advisory pack warns without aborting later
  packs.
- Invalid YAML produces a normal configuration finding rather than a traceback.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_package_planning tests.test_runtime_package_execution
```

## Slice 2: Compose named packs with stage and scope

**Depends on:** Slice 1.

**Owner:** CLI selection grammar, change-scope resolution, planning, and their tests.

**Files:**

- `src/project_governance_runtime/cli.py`
- `src/project_governance_runtime/planning.py`
- `tests/test_runtime_package_planning.py`
- `tests/test_runtime_package_execution.py`
- `docs/specs/governance-kernel.md`
- `docs/governance/hook-and-check-taxonomy.md`

**Changes:**

- Allow both `plan` and `check` to accept `--pack` with `--stage` and one valid scope form.
- Stop using `mode=explicit` to mean both named-pack selection and explicit-path scope. Carry named
  pack IDs independently from the existing `impacted` or `all` scope mode.
- When a stage is present, restrict the named pack and its dependencies to that stage and apply the
  stage-command coverage rule from Slice 1.
- Preserve these small public forms:

```sh
project-governance check --pack <id>
project-governance check --pack <id> --stage pre-push --mode impacted
project-governance check --pack <id> --stage pre-commit --mode impacted --staged
project-governance check --pack <id> --changed-path <path> --base-ref <base>
project-governance plan --pack <id> --stage <stage> --mode impacted --json
```

- Continue to reject only genuinely conflicting subjects such as `--staged` with `--changed-path`
  or `--base-ref`, and `--mode all` with a changed comparison base.

**Acceptance:**

- A plan names only the requested pack plus valid dependencies.
- Stage filtering applies to both the pack and its commands.
- The immutable changed packet still represents staged, branch-aware, explicit-path, or all scope
  honestly.
- Unknown pack, unavailable dependency, invalid scope combination, and zero-command results remain
  fail-closed and explainable.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_package_planning tests.test_runtime_package_execution
```

## Slice 3: Make shipped pre-PR authoring-only

**Depends on:** Slice 2.

**Owner:** shipped hooks, pull-request narrative integration, and the clean-wheel seam.

**Files:**

- `.githooks/pre-pr`
- `src/project_governance_runtime/assets/.githooks/pre-pr`
- `tests/test_runtime_change_narrative.py`
- `tools/verify-runtime-wheel.py`

**Changes:**

- Change the shipped and source pre-PR hooks to run:

```sh
project-governance check --pack pr-description --stage pre-pr --mode all
```

- Use the all-subject envelope because this named, unscoped checker needs no branch comparison; it
  does not widen selection beyond `pr-description`.
- Continue accepting only the existing paired title/body overrides.
- Keep `pr-description` at `pre-pr` and `ci-pr`; do not change other built-in pack declarations.
- Update the clean-wheel proof so it verifies that the installed pre-PR hook selects only
  `pr-description` and still rejects an invalid title or body.

**Acceptance:**

- Preparing a pull request does not rerun format, naming, maintainability, comments, secrets, test
  quality, or target-owned impacted packs.
- The PR narrative still fails closed locally and in provider CI.
- The pre-push sign-off remains unchanged and remains the local code-validation boundary.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_change_narrative
```

## Slice 4: Reconcile the one operating contract

**Depends on:** Slice 3.

**Owner:** the smallest set of live operator and installed guidance that currently describes the
normal lifecycle.

**Files:**

- `docs/governance/validation-strategy.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `docs/system-spine.md`
- `docs/guides/user-guide.md`
- `docs/specs/governance-kernel.md`
- `src/project_governance_runtime/assets/skills/impact-planning/SKILL.md`
- `tests/test_runtime_skill_payload.py`

**Changes:**

- State one lifecycle consistently: focused owner check, one affected pre-push sign-off, narrow PR
  narrative check, independent CI, and broad release proof.
- Keep duration telemetry descriptive while leaving local-feedback objectives and execution
  deadlines with the target repository or operator.
- Use either a focused owner execution or the unchanged enclosing gate as an affected recheck; do
  not automatically run both.
- Remove examples that present a full impacted pre-PR run as routine work.
- Do not add a new operating-model document; the validation strategy remains authoritative.

**Acceptance:**

- A reader sees the same lifecycle in the system spine, operator guide, taxonomy, runtime contract,
  and installed skill.
- No guidance asks for both a branch-aware pre-push sign-off and a full local pre-PR replay.
- No guidance asks for a named owner and its unchanged enclosing gate as additive rechecks.
- Documentation continues to separate governance orchestration from project-owned builds and tests.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_skill_payload
```

## Slice 5: Return duration policy to the target

**Depends on:** Slice 4.

**Owner:** runner defaults, source-owned CI boundaries, tests, and the operating contract.

**Changes:**

- Remove the generic 540-second command default while retaining explicit fail-closed timeout and
  process-group cancellation behavior.
- Reject nonpositive or nonfinite explicit timeout values.
- Give this repository's source-readiness, narrative, and release jobs target-owned job limits;
  cancel superseded pull-request jobs without changing immutable release concurrency.
- Reconcile installed review and workflow skills so existing proof is consumed before another
  command is run.

**Acceptance:**

- A target command runs without a runtime deadline unless its target or operator supplies one.
- An explicit timeout still terminates owned processes, exits nonzero, and reports `timeout`.
- Git-hook retries and review skills do not instruct agents to replay an unchanged enclosing gate.
- Source CI bounds belong to this repository's workflows, not the reusable wheel contract.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_package_execution tests.test_runtime_package_planning
python3 -m unittest tests.test_runtime_change_narrative tests.test_runtime_release_versioning
python3 -m unittest tests.test_runtime_skill_payload
```

## Slice 6: Bound workspace and observability overhead

**Depends on:** Slice 5.

**Owner:** installed execution guidance, evidence-root lifecycle, public receipt projection, and
local advisory telemetry.

**Changes:**

- Make the current checkout the default shared workspace for the primary, read-only specialists,
  and one bounded writer. Require direct operator authority for every additional worktree and
  report any authorized path plus its disposition at closeout.
- Remove a pack evidence directory and its run parent only when they are still empty after manifest
  inspection. Preserve every nonempty target-owned directory without adding a retention daemon or
  destructive cleanup command.
- Add one common `--summary` projection for `plan` and `check`; use it in shipped hooks. Keep the
  full result for default JSON output and `--json-output`, and retain non-passing findings in the
  compact projection.
- Retain one validated SHA-256 subject digest on validation lifecycle events. Derive unmatched
  starts, runner overhead, same-subject repetition, and cross-stage repetition at status time.
- Make `telemetry status` the one compact inspection surface. Bound the JSONL by one mebibyte as
  well as 1,000 records and retain only validation lifecycle data plus the ten slowest packs.

**Acceptance:**

- No installed instruction treats delegation as authority to create or move a worktree.
- Empty runtime-created evidence directories do not accumulate, while target-written evidence is
  untouched.
- Compact passing receipts contain no command stdout, stderr, argv, changed-path list, or source
  records; compact failures retain their normalized findings.
- Telemetry contains no paths, source content, command output, findings, prompts, documentation,
  skills, agent activity, or free-text subject identity. It fails open and stays within both 1,000
  records and one mebibyte.
- Status distinguishes an unmatched start from a terminal run without guessing a generic timeout
  or declaring the run hung.

**Focused proof:**

```sh
python3 -m unittest tests.test_runtime_skill_payload
python3 -m unittest tests.test_runtime_package_execution tests.test_runtime_telemetry
python3 -m unittest tests.test_runtime_package_planning
```

## Slice 7: Retire control-plane paperwork

**Depends on:** Slice 6.

**Changes:**

- Remove provider routing, dispatch state, worker leases, role contracts, and per-skill closeout
  receipts from the wheel. Delegation uses the host agent's native controls in the current checkout.
- Remove provider- and model-specific peer-review ladders. Use the operator's selected model or the
  current primary for one review pass; repeated failure returns to the owning check or operator.
- Bound ignored context materializations to the current packet plus seven recent packets.
- Retire old target-migration and predecessor-cleanup engines. A schema-changing update stops at
  dry-run until the operator deliberately applies the reviewed lock.
- Remove stale proposal trees, dormant delegated-role skills, and overlapping implementation skills.
- Make `doctor` understand source checkout mode and preserve advisory severity when an advisory pack
  resolves no command.
- Materialize every selected skill inside the bounded context packet, cap source reads before
  allocation, keep skill reads within the 16 KiB and configured context allowance, rebuild corrupted
  ignored packets, and let context coordination wait on the operating system lock without a runtime
  deadline.
- Reclaim inactive empty evidence scaffolding, bound every telemetry scan to one mebibyte, validate
  candidate locks in memory, and replace the tracked lock atomically.
- Remove stale provider profiles and role adapters plus the duplicated peer-dispatch resource; keep
  only thin source adapters that resolve to live shared skills.

**Acceptance:**

- The runtime has no persistent agent state, retry path, provider catalog, worker lease, or skill
  utilization ledger.
- Context packets are capped at 256 KiB including skills and retain at most eight completed packets;
  required skills outside the documented skill allowance block explicitly, and interrupted runtime
  staging is cleaned safely. Telemetry appends never rescan more than one mebibyte.
- Corrupted ignored context state self-heals, lock contention cannot become an arbitrary two-second
  failure, and completed empty run directories do not accumulate or endanger active or target-owned
  data. Run-marker setup and teardown are serialized without serializing validation itself.
- Source adapters name only live shared skills and contain no provider/model availability catalog.
- Update never edits or deletes project-owned configuration or historical target artifacts.
- Source `doctor` passes without pretending the source repository is an installed adopter.
- A no-command advisory pack reports an advisory finding and does not become a false blocker.

## Stable-Candidate Proof

This plan changes selection and a shipped hook, so the final frozen candidate receives one broad
source proof after all focused suites pass. Do not run the broad suite between slices.

```sh
python3 -m unittest discover -s tests -p 'test_runtime_*.py'
python3 -m pip wheel . --no-deps --wheel-dir dist
python3 tools/verify-runtime-wheel.py dist/project_governance_runtime-*.whl
tools/run-source-governance.sh check --summary --stage pre-push --mode impacted
```

One bounded independent review then checks only these questions against the frozen diff and existing
proof:

1. Can any selected blocking pack still pass without a command?
2. Does named-pack execution retain the requested stage and exact change scope?
3. Does the shipped pre-PR hook execute only `pr-description`?
4. Did the change introduce any cache, registry, scheduler, retry, or second authority?
5. Does duration policy remain target- or operator-owned while explicit timeout stays fail-closed?
6. Can delegation create a checkout or worktree without direct operator authority?
7. Do compact receipts retain actionable failures while omitting successful process output?
8. Does telemetry expose only bounded digests and aggregate efficiency signals?

One review finding permits one focused repair and one affected recheck. It does not restart the
whole review or broad proof cycle. A repair that changes selection or hook behavior forms a new
candidate and reruns the final broad proof once.

## Delivery Order

1. Reduce and commit Slice 1 as one correctness checkpoint.
2. Implement and commit Slice 2 as one public selection-contract checkpoint.
3. Implement Slices 3 and 4 together because hook behavior and user guidance are one contract.
4. Implement Slice 5 without adding a duration-policy schema or receipt cache.
5. Implement Slice 6 as one bounded workspace and observability checkpoint.
6. Freeze the candidate, run the single broad proof, and perform the bounded review.
7. Retire the control-plane and stale historical surfaces from Slice 7.
8. Prepare a release candidate only after explicit operator authorization.

The plan is complete when every slice acceptance boundary passes and the final diff contains no
machinery listed under Explicit Non-Goals.

## Closeout

- Implementation checkpoints: `5b771fb` through `fbf8290` on
  `codex/governance-recovery-efficiency`.
- Complete source proof: 285 runtime tests passed with one intentional skip after the final runtime
  repair; the final documentation and deterministic concurrency-test closeout passed its 32 focused
  tests and affected documentation check.
- Installed proof: wheel
  `project_governance_runtime-1.4.1.dev14+gfbf8290ae28d-py3-none-any.whl` passed the clean-adopter
  verifier with SHA-256 `31dd52e569fd20d4ede8964222ac4eaa8b5a51995e9f03470a4b41bce1e6bb3d`.
- Branch sign-off: impacted pre-push passed nine selected packs against
  `canonical/main@d29f0e38e89043d241d35750db29b53f681ab863`.
- Independent review: Claude Opus 5 high effort, fallback disabled, write mode `none`, reported no
  actionable finding after focused reconciliation; wrapper audits recorded no repository changes.
- Runtime outcome: routine work has one staged inner loop, one affected pre-push sign-off, a narrow
  pull-request narrative check, independent CI, and a broad release boundary. Delegation creates no
  worktree without direct operator authority, and the wheel contains no provider scheduler, retry
  loop, worker lease, or skill-closeout ledger.
- Publication boundary: the breaking simplification requires `2.0.0`; publication follows the
  repository release process after explicit operator authorization.
