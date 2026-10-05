---
id: spec.engine-linting-mvp
title: Deterministic Focused Linting MVP
type: spec
status: approved
owner: project-governance
created: 2026-10-05
updated: 2026-10-05
summary: Defines installable lint adapters, visible coverage and required narrow checks through the existing pack runner without model calls.
---

# Deterministic focused linting MVP

## Decision and boundary

Make established lint tools part of the normal governed development path. Code selects the inputs,
runs the tool and reports its findings. Neither the coding model nor JEV decides whether an adopted
required check runs. Implementation is authorized for the next major; published support requires its
installed proof and release qualification.

The [delivery plan](../exec-plans/active/2026-10-05-linting-mvp.md) owns implementation and proof.
This work extends the mechanical-check workstream in the
[next major specification](engine-4-verification-feedback.md#4-convert-repeated-mechanical-findings-into-checks).
The existing [kernel](governance-kernel.md), [execution contract](engine-workflow-and-device-contract.md)
and [validation strategy](../governance/validation-strategy.md) keep their authority. There is one pack
planner, one managed executor and one check receipt. The major plan owns integration and release.

Current format checks mainly find trailing whitespace. Naming checks mainly cover filenames.
Source analysis and test-quality advice do not establish a successful language linter or typecheck.
Custom packs can already invoke tools, but an ordinary command can read the live checkout rather
than the staged candidate. The MVP closes that adapter boundary and exposes actual coverage.

## Intended result

1. Setup identifies the project's existing lint tools and configuration without a model call.
2. The operator adopts a small generated pack and any missing project-local tool setup.
3. The agent implements one coherent batch, including its regression cases.
4. The normal check command runs the adopted tools on the declared affected candidate.
5. Findings identify the rule and source location. The agent groups repairs and rechecks affected owners.
6. Normal commit and integration gates retain required enforcement and original evidence.

The agent still diagnoses and changes code. This work removes repeated tool selection, result parsing
and avoidable review calls; it does not promise measured token savings before comparable task evidence.

## R1 — Use existing execution and make no model calls

Ship thin packaged tool adapters used by target-owned validation packs. Keep the existing `run`
command shape and captured-packet environment; do not add a second runner or lint scheduling service.
The adapter has no provider client, model fallback or delegation path. Selection, setup inspection,
lint execution, result normalization and coverage reporting make zero LLM and zero JEV calls.

Check mode never fixes source, updates dependencies, writes a baseline, stages files or commits.
An agent may use a project's existing fix command deliberately on owned files, then submit the changed
candidate normally. It must not run repository-wide formatting as a side effect of installing lint.

## R2 — Adopt project tools with honest installation states

Extend the existing initialization/setup flow, not startup or prompt hooks. Inspect local manifests,
explicit lint configuration, scripts, workspace/module roots and installed project tools. Respect
existing generated/vendor exclusions. Do not execute repository scripts merely to discover them.

Before writing, show the proposed owners, paths, rule preset, stage mapping, config files, tool versions,
missing prerequisites and exact files to add or change. Preserve existing lint rules and tool ownership.
Ambiguous configurations require an explicit choice; an LLM guess cannot become machine policy.
Repeated setup with the same inputs is idempotent. Concurrent setup refuses conflicting writes.

For a supported greenfield stack with no lint setup, offer the small starter in R3. Generate project-owned
configuration and pack declarations through the normal setup writer. Add pinned development dependency
declarations only within the accepted setup changes. Tool acquisition remains an explicit project package-
manager operation. Checks and hooks never download tools, run package installation or use fetching launchers.

Report one of these states per declared source root:

| State | Meaning |
| --- | --- |
| Ready | An adopted required pack, compatible available tool and declared inputs cover the root |
| Needs setup | Tools, configuration, rule choice or an exact-input adapter are missing or ambiguous |
| Unsupported starter | The language is detected but has no shipped starter; a project pack can supply it |
| Explicitly excluded | The project deliberately excludes the root and records its reason |

An empty repository is not proof of coverage. On first source introduction, detect its stack and require
setup or an explicit exclusion at the normal gate. Doctor must not describe `needs setup` as lint-ready.
Once lint is adopted, deleting its pack/configuration must not silently disable it: retain the requirement
in the existing profile owner and diagnose drift. Deliberate removal changes that declaration visibly.
The normal `plan`/`check` path validates those obligations from the captured candidate profile against
available packs, covered roots and required stages. Doctor explains the same gaps; it is not the gate.

## R3 — Small defaults, language-neutral extension

The first packaged backends are Ruff for Python and ESLint for JavaScript/TypeScript. Both qualify the
same execution/result contract. A project-owned adapter can integrate any other language through the
existing pack interface. Prove that extension with a non-Python/non-JavaScript fixture; do not claim a
bundled Kotlin, Swift, C++ or other toolchain. Mixed repositories declare coverage per source root.

| Starter | Initial blocking rules | Deliberately outside the default |
| --- | --- | --- |
| Python | Ruff syntax/undefined-name and related high-confidence families: E9, F63, F7, F82, qualified against the supported version | Broad style changes, unused-code cleanup and unsafe fixes |
| JavaScript/TypeScript | Qualified parser errors and a short explicit core list: duplicate object keys, unreachable code, unsafe finally control flow and invalid `typeof` comparisons | Type-aware lint, import graphs, stylistic rules and large plugin collections |

TypeScript needs a compatible configured parser. Do not use JavaScript's undefined-name rule as a
substitute for the TypeScript compiler. Existing projects retain their configured rules and severity;
do not replace a stronger accepted setup with these starters. Exact tool versions and presets are
qualified together and recorded in the package's supported-tool documentation.

All starter violations block. Existing native warnings remain advisory unless the project explicitly
changes their severity. Missing tools, invalid configuration and unreadable results always fail execution.

Reuse an existing formatter as a separate check if the project already owns one. Formatting and
code-quality lint have separate claims; do not run the formatter inside the lint adapter. New universal
formatting presets and additional packaged formatter backends are outside this MVP. Existing whitespace,
documentation and other governance checks remain active; replacement needs separately proved equivalence.

## R4 — Check the declared slice, with sufficient context

Pack globs select owners; they do not determine what a tool actually reads. Each adapter filters the
captured packet to its declared source roots and preserves original logical filenames. The packet's
numbered snapshot filenames must not change parser selection, ignore behavior or config resolution.

Default early lint checks complete affected files, not just changed lines. This catches errors whose
location is outside the edit. Run one tool invocation per compatible owner/config group where the tool
supports a file list; do not spawn a process per finding. Deleted files are not linted as current source.
Renames assess both owners and the destination's rules. Configuration, rules, ignores, baselines and
toolchain/lock changes invalidate the affected owner's coverage and widen to its declared source root.

The project build tool owns dependency expansion. Type-aware lint and compilation are separate opt-in
packs with a qualified module/candidate input contract. Do not infer dependency closure from filenames,
scan every repository on each edit, or claim a file-local pass establishes whole-program correctness.

A task's stated slice does not hide other staged changes. At a commit gate, check the actual candidate's
affected owners. If it mixes unrelated work, fix staging/ownership rather than omit paths to get a pass.

## R5 — Prove the bytes and configuration actually checked

For staged and branch-candidate proof, the adapter reads captured after-images and exact candidate
configuration. Use tool-supported stdin with logical filenames or an isolated candidate tree preserving
paths. Reuse `ValidationSubject` for base-plus-overlay inputs; the changed packet alone is not a full tree.
Do not stash, overwrite or mutate a concurrent worktree to prepare inputs.

The existing capture owner prepares declared extra adapter inputs from its already resolved subject,
including first-commit identity. Pass verified snapshots and references to the helper. Do not reconstruct
`ValidationSubject` from the smaller wire packet or resolve a fresh Git/index/worktree scope inside the
adapter. This is a minimal addition at the existing boundary, not another candidate capture owner.

Declare configuration imports, ignore files, baseline files, adapter identity and project toolchain
inputs. Record their identities with the existing evidence manifest. Select the tool explicitly and
disable undeclared user-global configuration. Project-local dependencies remain trusted executable
inputs, with the supported version and lock/config identities recorded; the receipt is not a supply-chain
attestation. Incomplete configuration/import capture is a coverage failure, not exact-candidate proof.

All-mode has no changed after-images. Enumerate the declared roots explicitly and label this checkout-
scope execution; never emit an empty pass because the change packet is empty. A diagnostic live-checkout
command can remain available, but it cannot satisfy a required exact staged/candidate claim.
The existing subject-bound manifest applies to changed/staged subjects. All-mode has no subject digest:
retain its tool/input identities in ordinary result-linked evidence artifacts without manufacturing a
digest or a v1 subject-bound manifest. Its result cannot be reused as exact staged proof.

Qualify opposing staged/unstaged source and configuration, path-dependent ignores and first-commit
repositories. Required adapters refuse an unsupported input mode instead of quietly using live bytes.

## R6 — Distinguish lint findings from tool failure

Normalize tool output into the existing checker envelope. Preserve the native command, exit status,
raw stdout/stderr and full findings outside source. Compact output gives rule, logical path, line/column,
severity, short explanation and safe-fix availability when reported by the tool; originals stay accessible.

| Nested tool outcome | Adapter outcome |
| --- | --- |
| Completed, clean | Exit 0, `passed`, no active findings |
| Completed, advisory warnings | Exit 0, `warning`, advisory findings |
| Completed, required lint violation | Exit 0, `failed`, blocking findings |
| Missing tool, invalid config, crash, malformed/truncated result, cancellation or unknown cleanup | Execution failure through the existing nonzero/abnormal-result path |

An exit of 1 can mean a normal violation for a native tool. Interpret each backend's documented exit
contract rather than blindly forwarding it. The outer adapter's successful completion does not erase
the nested violation; the structured blocking result still fails its pack and dependent review.
Infrastructure failure cannot be downgraded by an advisory pack. Keep independent checks running on
ordinary lint findings under existing runner semantics; never turn an infrastructure error into no findings.

Use the managed process group and existing check deadline for all nested work. Retain cancellation and
cleanup evidence. Do not add a new short per-file/per-call timeout. Grouping work must not bypass the
owner's existing overall execution limit or output safeguards.

## R7 — Enforce at useful checkpoints without another testing loop

Adopted lint packs are blocking at `batch`, `pre-commit` and the existing integration stages selected
by the project, including its pre-push/pre-PR/CI requirements. Setup records that mapping and verifies
it; a diagnostic named-pack pass does not establish full-stage coverage. Existing required checks remain.

The implementation plan names the coherent batch and its focused lint/test checkpoint. Finish its related
behavior, bindings and regression cases before that checkpoint. Earlier execution needs a named blocker,
defect reproducer or new risk. Neither each edit, each helper, prompt entry nor Stop triggers lint.

When a governed code workflow already declares review, make review depend on its required batch check.
Design/document review does not acquire an unrelated code build. Normal commit hooks still run; count
their proof instead of manually repeating the same check immediately before the hook. A final integration
gate checks the exact integration candidate and its required owners. Reuse only qualified existing proof
while relevant inputs remain valid. No generic successful-check cache is added.

Agent guidance names the normal commands and cannot waive the adopted packs. Runtime gates enforce
those commands; guidance alone cannot force every raw shell call or every host to use them. Git hooks
can be bypassed, so required integration proof remains necessary. Report missing host/workflow coverage
instead of claiming universal agent enforcement or silently launching extra checks.

## R8 — Contain existing debt without silently accepting new defects

Preserve a project's existing accepted baseline where the tool supports one. Qualify unchanged debt,
a new violation, same-count replacement, rename/deletion and changed configuration. A count-based
suppression is not exact defect identity. If it cannot detect replacement, do not claim it enforces
no-new-defects; use a clean, explicitly declared adoption area or a separate reviewed debt policy.

For a repository without a qualified baseline, begin with the small rule preset in clean declared roots.
Expose uncovered legacy roots as rollout gaps. Expanding coverage is deliberate project work; do not
require repository-wide cleanup to lint an unrelated implementation slice. Within an adopted root,
complete changed-file lint can require repairing old findings in that touched file. State that tradeoff
at adoption rather than introducing an unqualified diff-only suppression engine.

Baseline creation/update is a separate visible project change. Never regenerate it during check, accept
every current finding automatically, or add a parallel governance lint-debt database. Existing waiver
authority remains unchanged. The MVP does not implement a universal finding matcher across languages.

## R9 — Make coverage and repetition visible using existing receipts

Extend doctor with passive lint coverage: source roots, required pack/stages, configured backend/version,
config owner, readiness, exclusions and gaps. It does not run lint, install tools or call providers.
Distinguish inspected setup from the last execution and current candidate proof.

Existing check evidence records backend/version, input mode, selected/checked/excluded file counts,
logical paths, widening reason, relevant input identities, outcome, duration and cleanup. Tool-ignored
expected files are explicit exclusions or coverage failures, not clean results. Summaries may sample
findings but must retain totals and links. No raw source or private prompts go into new telemetry fields.

Use the [release evaluation contract](engine-release-evaluation.md) to compare executed coverage, missing-
tool failures, false findings, check frequency, repeated unchanged checks and accepted task outcomes.
The lint lane's zero model calls is a mechanical property; overall token/time savings need comparisons
including repairs, additional reads and review. Tool-native caching is allowed only within its qualified
invalidation contract; no cross-worktree cache is presumed safe.

## R10 — Required qualification and completion

The implementation plan maps R1–R10 to focused suites. Required proof includes clean/violating tools,
missing prerequisites, staged/config identity, mixed stacks, first source, scope/widening, empty/ignored
coverage, normal violation exits, malformed output, concurrent worktrees, cancellation and ordinary gates.
At least one installed package journey must reject a seeded lint fault through its normal hook and pass
the corrected candidate. A missing executable is not proof that the intended rule detected the fault.

This MVP is complete when both starter backends, the generic extension contract, setup/doctor visibility,
required normal-gate wiring and packaged qualification are implemented. Documentation-only examples or
synthetic adapters alone do not close it. Adopter changes and release publication remain separate steps.

## Evidence behind the design

- [Prettier's integration guidance](https://prettier.io/docs/integrating-with-linters) separates formatting
  from code-quality rules and describes the cost of combining them through linter plugins.
- [Ruff's linter contract](https://docs.astral.sh/ruff/linter/) distinguishes violations from invalid
  invocation/configuration and safe from unsafe fixes. Its
  [configuration rules](https://docs.astral.sh/ruff/configuration/) require deliberate control of discovery.
- [TypeScript ESLint's typed-linting guide](https://typescript-eslint.io/getting-started/typed-linting/)
  describes the extra project information and cost. Typed lint is a separate opt-in capability here.
- [ESLint's suppression design](https://eslint.org/blog/2025/04/introducing-bulk-suppressions/) describes
  per-file/rule counts. The same-count replacement qualification is our response to that limitation.
- [Git's commit documentation](https://git-scm.com/docs/git-commit) documents hook bypass. Required trusted
  integration proof is our enforcement boundary; native host compliance is separately qualified.

## Deliberate simplifications

Two starter backends and one existing extension path; no universal parser. Existing packs and receipts;
no lint service. Small bug presets; no style overhaul. Native or explicitly scoped debt; no new baseline
database. Planned batch checkpoints; no per-edit hook. Existing build-tool caches; no generic pass cache.
No model calls for mechanical work and no attempt to prove arbitrary specification intent from lint.
