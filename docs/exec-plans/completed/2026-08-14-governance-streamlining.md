---
id: exec-plan.governance-streamlining
title: Governance Streamlining
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-14
updated: 2026-08-15
summary: Delete validation amplification while retaining changed-scope context, architectural review, and one credible boundary proof.
---

# Governance Streamlining Implementation Plan

Source implementation and source-repository proof are complete. Any remaining shadow adoption is
owned by an adopting repository under its own plan and authorization; it is not an active lane in
this checkout.

## Outcome

Make routine governance proportional to changed behavior and risk. The finished runtime will keep
agents in the right context, retain the universal 500-line architectural-review threshold, block
concrete correctness and ownership gaps, and run one credible integrated proof at the appropriate
boundary. It will not turn pre-existing debt, changed file count, or repeated policy matches into an
unbounded implementation program.

Implementation starts from `main@e51dd0e5bc16a4a7cf1359c7cdcf461d1304e77d` on the proposed branch
`codex/governance-streamlining-postmortem`. This plan authorizes source-repository work only after
the operator starts that implementation lane. It does not authorize a wheel publication, remote
push, release, or adopter modification.

## Fixed Decisions

1. The 500-line threshold remains universal and blocking for a directly changed architectural
   source unit: a parser-backed declaration, or the file when no supported declaration parser owns
   the changed code. Crossing it does not imply that a class or file must be split. The aggregate
   length of several narrow parser-backed declarations is not treated as one oversized class.
2. Architectural review judges cohesion, responsibility count, coupling, navigability,
   readability, and testability. A cohesive source unit may remain over 500 lines.
3. Moving code to a helper solely to reduce a line count is not remediation. An extraction is
   justified only when it creates a coherent owner, reduces coupling, and improves independent
   comprehension or testing.
4. New files and declarations are fully governed. Existing code is governed only where the change
   directly touches a declaration or materially changes its responsibility or public boundary.
5. Existing debt does not become feature scope merely because a file was encountered.
6. Each risk has one execution owner. A target-owned pack may explicitly replace a built-in pack;
   implicit replacement and duplicate routine execution are forbidden.
7. Development uses a focused owner check and one affected seam. Pre-commit and pre-PR each have
   one impacted boundary. A complete matrix runs once for release, an explicitly requested
   exhaustive proof, or another broad-proof condition already named by the validation strategy.
8. A failed pack is repaired and replayed alone. The impacted umbrella is reserved for one
   closeout, not used as the inner repair loop.
9. The first implementation does not add a persistent product-proof cache, semantic proof graph,
   or generalized resume engine. Those require later measured evidence of need.
10. Target-specific path families, commands, coverage thresholds, product evidence, and migration
    receipts remain outside this checkout.

## Non-Goals

- Replacing human architectural judgment with an automated god-class score.
- Building parsers for every supported source language.
- Lowering the 500-line architectural-review threshold or making it advisory.
- Requiring every existing oversized class to be refactored.
- Creating path-by-path coverage, waiver, or comment registration ledgers.
- Teaching the generic runtime about a particular adopter's platforms or build system.
- Maintaining two runtime authorities or a compatibility shim for retired policy behavior.
- Automatically changing an adopter when a new wheel is built.

## Operating Contract

### Normal lifecycle

| Boundary | Required work | Explicitly excluded |
| --- | --- | --- |
| Implementation | Focused owner test plus one directly affected seam. | Full suite, full platform matrix, repeated umbrella checks. |
| Pre-commit | One impacted static gate over new and directly changed scope. | Device work, unrelated legacy cleanup, exhaustive product proof. |
| Pre-PR | One impacted integrated gate. | Replaying separately passed constituent commands without invalidation. |
| Release or explicit exhaustive proof | One complete declared matrix on a stable candidate. | Running the matrix after every repair attempt. |
| Failed check | Repair and replay the failed owner. | Refreshing every pack automatically. |

If an integrated proof finds an order-dependent defect, isolate it with a focused reproducer. Once
the focused repair passes, run one integrated confirmation. After two failures of the same broad
command, stop using it as the diagnosis loop and identify a focused owner before another closeout.

### Blocking findings

Routine governance may block for:

- a secret or security violation;
- a syntax, compile, or type failure owned by the changed surface;
- a failing relevant behavior test;
- a deterministic changed-scope formatting or lint failure;
- a changed or new public-contract violation;
- a lifecycle, concurrency, state-ownership, or dependency-direction violation;
- an unknown owner for changed behavior;
- a missing proof required by a high-risk changed family;
- an expired explicit temporary waiver;
- a new, newly crossed, or directly changed oversized source unit awaiting architectural review;
- a reviewed source unit whose architectural disposition is `refactor-required`.

Warnings about old debt, size alone after accepted review, untouched declarations, prose
preferences, and optional cleanup are advisory. Advisory output is not an instruction to expand the
current task.

### Scope terms

- The runtime resolves one comparison subject into one immutable changed-path packet before any
  change-sensitive checker runs. Each record carries mode, status, current path, previous path for
  a Git rename, before and after content locators, and exact after-image hunk ranges.
- Staged mode compares the `HEAD` blob with the index blob. Its after-content locator is the index,
  and checkers analyze that index content even when the working-tree file has additional unstaged
  edits. Branch-aware changed mode compares the resolved upstream merge-base with current
  working-tree content. An untracked path is new, has no before-image, and is fully in scope.
- Branch-aware mode without a resolvable upstream merge-base and explicit-path mode without an
  explicit base emit one grouped `comparison-subject-unresolved` planning blocker for packs that
  require diff semantics. They never silently fall back to `HEAD` or reinterpret the entire
  current file as changed. The blocker shape is `{"code": "comparison-subject-unresolved",
  "mode": "<mode>", "paths": ["<sorted-unique-path>"]}`.
- A changed range is an exact after-image hunk range from that packet, with no padding window.
  Checkers consume its content locators and ranges; they do not select another Git comparison or
  read a different version of the file.
- `PROJECT_GOVERNANCE_CHANGE_PACKET` names the read-only JSON packet supplied to every built-in and
  target-owned child command. The version-1 wire shape is
  `{"kind":"project-governance-change-packet","version":1,"scope":"changed|all",
  "mode":"staged|changed|explicit|all","base_ref":"<sha-or-null>","records":[...]}`.
  Each changed record is `{"status":"added|modified|renamed|deleted","path":"<repo-path>",
  "previous_path":"<repo-path-or-null>","before_path":"<absolute-read-only-path-or-null>",
  "after_path":"<absolute-read-only-path-or-null>","changed_ranges":[{"start":1,"end":1}]}`.
  The runtime materializes the exact before- and after-image bytes at those temporary paths; a child
  reads them without invoking Git or substituting the checkout file. In `all` mode the packet has
  `scope: "all"`, no records, and means full-repository execution against the checkout. A target
  replacement accepts the same content and scope contract as the built-in concern it owns.
- Maintainability treats a parser-reported declaration as directly changed when its full extent
  intersects a changed range. This makes a body edit to an oversized class eligible for bounded
  architecture triage.
- Comments treat a declaration as directly changed only when its parser-reported header or
  signature intersects a changed range. A body-only change does not reopen an old comment gap.
- A new file is fully in scope for both concerns.

### Work budgets

These are maximums, not quotas. A known security, correctness, public-contract, concurrency,
`refactor-required`, pending threshold-review, or required new-boundary documentation failure
remains blocking; the budgets stop unrelated debt expansion.

| Work | Default budget |
| --- | --- |
| Deep architecture remediation caused by threshold review | Highest-risk three classes or 30 minutes, whichever comes first. |
| Legacy architecture cleanup | Zero unless explicitly added; then two classes or 30 minutes. |
| Unrelated comment cleanup | Zero. |
| Helpful adjacent comment cleanup | Five comments or 20 minutes. |
| Repeated governance repair | Two attempts or 30 minutes before classifying the owner as product defect, evidence gap, or governance defect. |
| Review | One integrated review unless security, release, critical impact, or the operator selects another. |
| Review context expansion | Changed files, the owning artifact, and at most five directly relevant supporting files or 20 minutes before reporting one grouped context gap. |
| Broad proof | One stable-candidate run, followed only by the focused-isolation rule above if it fails. |

Human-facing output shows the first ten examples for one advisory category plus its total count.
Machine-readable JSON may retain the complete list. No per-file administrative record is created
merely because a warning was reported.

When a budget expires with a blocker still open, stop, report the owner classification and residual
blockers to the operator, and do not run a broader gate. A budget caps discretionary remediation;
it never converts an unresolved blocker into a pass or an instruction to inspect more files.

## Implementation Slices

Each slice changes one authority and includes its tests and documentation. Do not merge a slice
whose Markdown contract claims behavior that the runtime does not yet implement.

### Slice 1: Resolve changed scope once

**Purpose:** Give every change-sensitive checker the same Git subject, exact ranges, and analyzed
content without letting each checker rediscover scope.

**Source changes**

- Extend `src/project_governance_runtime/changed_paths.py`, the immutable packet in
  `execution_flow.py`, and `checker_scripts/governance_changed_paths.py` to resolve the comparison
  subject and content locators once using the Scope terms above.
- Carry the packet through planning and execution without recomputing ranges. A checker may
  parse its packet-named materialized file, but may not choose a different base or substitute
  working-tree content for index content.
- Materialize before and after bytes under the execution's temporary directory, serialize the
  version-1 packet once, make the files read-only, and expose the packet path as
  `PROJECT_GOVERNANCE_CHANGE_PACKET` to every child command. Keep all of it ephemeral and
  run-scoped; do not persist a changed-file ledger or proof cache.
- Emit one grouped planning blocker when a required comparison subject cannot be resolved.

**Focused tests**

- A partially staged file is ranged and analyzed from its index content, not additional
  working-tree edits.
- A target-owned synthetic child reads a marker that exists only in the staged after-image through
  the packet path, proving it did not analyze additional working-tree edits.
- Branch-aware mode uses the resolved upstream merge-base and all consumers receive identical
  ranges.
- A missing upstream merge-base and an explicit path without a base each fail once with the grouped
  blocker for a diff-sensitive pack.
- A new untracked path has no before-image and is fully in scope.

**Owning tests:** `tests/test_runtime_changed_paths.py`, focused execution-flow tests, and selection
tests for `checker_scripts/governance_changed_paths.py`.

### Slice 2: Give each built-in capability one explicit owner

**Purpose:** Stop generic and target-owned packs from executing the same concern for the same
repository.

**Source changes**

- Extend target pack validation in `src/project_governance_runtime/configuration.py` with the
  optional `replaces_builtin_packs` list. A pack that replaces a change-sensitive built-in must
  also declare `change_packet_contract: 1`; reject replacement without that acknowledgment.
- Keep pack identifiers unique. Replacement names the existing built-in identifier; it does not
  reuse or overwrite that identifier.
- Permit only an active target-owned pack to declare replacement. Reject unknown built-ins,
  replacement of supplemental packs, self-reference, duplicate replacers, missing commands, and a
  replacement whose stages do not cover the replaced pack's stages.
- Treat replacement as repository-wide in this first version. Do not add path-scoped replacement
  precedence or a capability registry.
- In `src/project_governance_runtime/planning.py`, omit a replaced built-in from `impacted` and
  `all` plans. Select the target replacement only through its own declared path patterns and normal
  selection rules in impacted mode; replacement does not cause it to inherit the built-in's
  patterns.
- Independently compare the replaced built-in's path matches with the target replacement's matches.
  In impacted mode, if a changed path matches the built-in but not the replacement, emit one
  `replacement-coverage-gap` blocker containing the replacement, built-in, and all affected paths.
  Emit one blocker per built-in/replacement pair, not one blocker per path, with this stable shape:
  `{"code": "replacement-coverage-gap", "built_in_pack_id": "<id>",
  "replacement_pack_id": "<id>", "paths": ["<sorted-unique-path>"]}`.
- In `all` mode, select the target replacement exactly once and treat the explicit repository-wide
  declaration as wholesale ownership of the built-in concern. Do not attempt static glob-inclusion
  proof or enumerate repository paths. The replacement receives an all-scope change packet and is
  responsible for full-repository execution; downstream shadow adoption proves representative path
  families before activation.
- Preserve supplemental packs such as secrets. Preserve direct diagnostic execution: an explicit
  `--pack <built-in-id>` request runs exactly the named built-in and does not silently redirect it.
- Add `replaced_packs` and replacement reasons to plan JSON so omission is explainable.
- Update `docs/specs/governance-kernel.md` and
  `docs/architecture/governance-runtime.md` to replace “may not silently replace” with this explicit
  replacement contract.

**Focused tests**

- A target replacement removes the built-in from impacted and all-mode execution.
- The replacement runs once when several changed paths match it.
- A path that matches the replacement but not the built-in selects the replacement normally.
- A mixed change with uncovered replacement scope produces one grouped blocker.
- All mode runs the replacement once with full-repository packet scope even when its impacted-mode
  path patterns are narrower than the replaced built-in's patterns.
- Two target packs replacing the same built-in fail configuration once.
- A change-sensitive replacement without `change_packet_contract: 1` fails configuration once.
- A replacement cannot suppress secrets or another supplemental pack.
- Explicit built-in execution remains available for diagnosis.
- An adopter with no replacements retains the existing built-in selection baseline.

**Owning tests:** `tests/test_runtime_package_planning.py`,
`tests/test_runtime_package_execution.py`, and the clean-wheel synthetic target in
`tools/verify-runtime-wheel.py`.

### Slice 3: Keep the 500-line gate and make its judgment durable

**Purpose:** Preserve god-class detection without forcing arbitrary splits or reopening accepted
cohesion after every byte change.

**Source changes**

- Retain `TEMPLATE_SOURCE_REVIEW_TRIGGER = 500` and the rule that a target may review earlier but
  not later.
- Change `src/project_governance_runtime/checker_scripts/check-code-smells.py` so declaration-level
  findings are emitted only for a new declaration or a declaration whose extent intersects an
  exact changed range from that packet. A change to one class must not promote another class in the
  same file into scope.
- Apply the threshold mechanically by architectural source unit. For a parser-backed file, emit an
  obligation for each new or directly changed declaration over 500 lines. Emit a file obligation
  only when no supported declaration parser owns the changed code, including parser-free files and
  changed file-level code outside every reported declaration extent. Do not emit a file obligation
  merely because several individually narrow declarations total more than 500 lines.
- Measure a parser-free file by its total physical line count. In a parser-backed file, measure the
  `<file>` unit as the physical lines outside every parser-reported declaration extent; it blocks
  only when that file-level extent exceeds 500 and a changed range intersects it.
- For nested architectural declarations, use the innermost parser-reported class, type, object,
  namespace, or module containing the changed range. Measure each architectural declaration by its
  physical extent minus nested architectural declaration extents, so a narrow container does not
  aggregate many independently narrow types and an oversized inner type does not duplicate its
  enclosing obligation. Methods and functions are not subtracted from their owning type; their
  separate length and complexity checks remain unchanged.
- Avoid duplicate review work: changed lines owned by an oversized parsed declaration produce its
  declaration obligation, not an equivalent file obligation.
- Keep changed-function length, complexity, and nesting enforcement. Do not scan untouched
  functions merely because their file changed.
- Replace exact cohesion fingerprints in
  `src/project_governance_runtime/defaults/schemas/quality-disposition.schema.json` with a stable
  version-2 cohesion decision keyed by the triple `(finding, normalized repository-relative path,
  stable symbol)`. A parser-backed declaration uses its qualified symbol; a file-level or
  parser-free review uses the literal symbol `<file>`. It records owner, reviewer, approval date, a
  responsibility statement, and rationale.
- A `cohesion-accepted` decision survives comments, formatting, small edits, and line-count growth.
  The architecture-review workflow reopens it only when the change adds or materially alters a
  responsibility, dependency direction, public surface, or orchestration role. A directly changed
  accepted source unit still receives a quick changed-range triage; only a material responsibility
  delta requires a new decision.
- A path or qualified-symbol rename deliberately changes the version-2 key. The runtime does not
  infer semantic identity or maintain aliases. An operator may move the one existing record in the
  same change after confirming the Git rename preserves responsibility; otherwise the renamed
  source unit receives a bounded new review.
- A rename may not orphan a `refactor-required` or unexpired `temporary-waiver` disposition. For a
  Git rename, check the packet's previous path; for a qualified-symbol change within a directly
  changed path, detect old disposition symbols that no longer resolve. Emit one grouped
  `quality-disposition-relocation-required` blocker until each such record is explicitly moved or
  superseded. This changed-scope lookup is not an alias registry.
- Also check deleted packet paths against those dispositions, even when Git reports a delete and
  add rather than a rename. In `all` mode, validate only that every `refactor-required` and
  unexpired `temporary-waiver` record still names an existing path; do not inventory unrelated
  source. Moving a temporary waiver preserves its fingerprint and expiry. Superseding a
  `refactor-required` record requires a new v2 decision with a named reviewer, approval date, and
  rationale that explicitly resolves the previous responsibility finding.
- Keep exact source fingerprint, current line count, expiry, and remediation plan only for a
  `temporary-waiver`. An expired or modified waiver blocks.
- Keep `refactor-required` blocking until the responsibility problem is resolved or reviewed again.
- Update `implementation-quality-review`, `architecture-review`, `governed-implementation`, and
  `work` skills so they state that the threshold demands judgment, not extraction.
- The architecture review must explicitly reject a helper extraction that only relocates related
  code without creating a meaningful owner.

**Migration rule**

- Do not create a compatibility shim for version-1 dispositions.
- A version-1 record is invalid as authorization. Its presence emits one grouped
  `quality-disposition-migration-required` blocker in the maintainability pack only; unrelated
  packs continue. The loader may inspect the version and disposition solely to report the migration
  requirement and must never use a version-1 `cohesion-accepted` record to pass a finding.
- A version-1 `refactor-required` or `temporary-waiver` record cannot be weakened during migration:
  the former remains blocking, and the latter retains its exact-source and expiry constraints while
  the migration blocker remains open.
- `project-governance update --dry-run` lists the exact version-1 record keys, dispositions, and
  required conversion action rather than reporting only a generic schema change.
- A downstream adopter may mechanically carry forward a previously approved `cohesion-accepted`
  decision by removing byte- and line-bound fields and retaining its responsibility and rationale.
  It must not convert `temporary-waiver` or `refactor-required` records into accepted cohesion.
- Version-1 fingerprint and line fields are deleted during migration and are never retained in a
  parallel registry.
- Migration is not permission to create dispositions for every oversized file in a repository.
  Neither migration nor routine scans auto-create records for untouched declarations.

**Focused tests**

- Exactly 500 lines passes; 501 lines without review blocks.
- A 501-line cohesive class passes after architectural acceptance.
- That acceptance remains current after a comment edit, formatting edit, and 50-line cohesive
  addition.
- An active temporary waiver is exact-source-bound; a byte change or expiry blocks it.
- Touching one class does not report an untouched oversized sibling class.
- One oversized type does not produce equivalent file and type review obligations.
- A parser-free oversized source file still blocks pending architectural review.
- A parser-backed file containing several narrow declarations does not block solely because their
  aggregate file length exceeds 500; more than 500 physical lines outside declarations block when
  that file-level unit is directly changed.
- A changed inner architectural declaration produces one innermost obligation; enclosing types are
  measured without nested type extents, while ordinary methods still count toward their class.
- A path or qualified-symbol rename blocks without an explicit record move and passes after the one
  unchanged-responsibility record is deliberately moved.
- A renamed `refactor-required` or unexpired `temporary-waiver` record produces one relocation
  blocker until explicitly moved or superseded.
- A delete-plus-add move below Git's rename threshold still blocks on the deleted disposition path;
  all mode detects a disposition whose path no longer exists.
- Each version-1 disposition fails the maintainability pack with one grouped migration blocker;
  unrelated packs remain runnable and no prior blocking disposition is weakened.
- Quality-review skill payload contains the no-mechanical-helper rule and no exact-fingerprint
  reopening instruction.

**Owning tests:** `tests/test_runtime_maintainability_adapters.py`, a new focused disposition test
module if necessary, and `tests/test_runtime_skill_payload.py`.

### Slice 4: Make comments a true changed-code ratchet

**Purpose:** Enforce documentation for code being created or materially changed without turning
historical comment debt into source edits.

**Source changes**

- In `comment_checker_selection.py`, keep `enforce_all` for a new source file.
- For an existing file, do not make the file overview blocking merely because any body line
  changed. Missing or weak existing overview text remains advisory unless the file itself is new.
- In `source_comment_analysis.py`, block declaration documentation only when the parser-reported
  declaration header or public signature intersects an exact changed range from the immutable
  packet, or when the file/declaration is new. A body-only edit does not promote an old declaration
  comment into scope.
- Keep new public and authority-boundary declarations fully enforced.
- Keep unsupported-language analysis advisory until a maintained parser-backed adapter exists.
- Key any necessary parser-backed waiver by normalized path, rule, and qualified declaration
  symbol. Use `<file>` only for a file-overview rule. Unsupported-language declaration analysis is
  advisory and therefore creates no blocking waiver or synthetic symbol. Do not key a waiver by
  source line or whole-file digest, and never auto-create waivers for reported debt.
- Cap human-readable examples by category while preserving complete JSON evidence.
- Update the generic implementation and quality-review skills to distinguish required new-boundary
  comments from optional adjacent cleanup.

**Focused tests**

- A new undocumented source file blocks.
- A new undocumented public declaration in an existing file blocks.
- A body-only edit to an old undocumented declaration does not block.
- Moving a documented declaration without changing its contract does not create a comment blocker;
  a moved waiver requires one explicit key update and no automatic alias.
- An existing missing file overview is advisory; a new file's missing overview blocks.
- A stable symbol waiver survives unrelated line movement.

**Owning tests:** `tests/test_runtime_comment_checker.py` plus selection-unit tests for changed-line
and new-file records.

### Slice 5: Evaluate dependency tuple changes, not touched manifest bytes

**Purpose:** Require freshness evidence for an introduced or updated dependency without blocking an
unrelated edit to a manifest containing unchanged dependencies.

**Source changes**

- Consume the comparison subject already carried by the immutable changed-path packet: staged mode
  compares the `HEAD` blob with the index blob; branch-aware changed mode compares the resolved
  upstream merge-base with current working-tree content; a new path has an empty before-image.
- Extract normalized `(ecosystem, name, version, artifact_type)` tuples from before and after
  content using the existing deterministic parsers.
- Evaluate only tuples present in the after-image and absent from the before-image. Removed and
  unchanged tuples need no new evidence.
- Replace path-and-whole-file-SHA evidence records with coordinate-keyed evidence. One authoritative
  coordinate record may satisfy the same dependency introduced in more than one manifest.
- Keep exact authoritative source, publication time, minimum-age policy, override expiry, and
  fail-closed behavior for an actually changed coordinate.
- Keep explicit-path mode conservative: require an explicit base reference for tuple-diff behavior
  and use the grouped unresolved-subject blocker when none exists.
- Report one actionable finding per uncovered changed coordinate, grouped under the selected
  manifest in human output.

**Focused tests**

- Editing a script field while dependencies remain unchanged passes without a new evidence record.
- Changing one dependency version requires evidence for only the new tuple.
- Adding one dependency requires one coordinate record even when the manifest already contains
  many unchanged dependencies.
- Removing a dependency requires no freshness evidence.
- The same coordinate used in two manifests reuses one coordinate record.
- Unknown syntax and malformed manifests continue to fail closed once.
- Staged and changed modes compare against the intended Git subject.

**Owning tests:** `tests/test_runtime_dependency_checker.py` and focused extractor/evidence tests.

### Slice 6: Remove instruction-driven loops and isolate each run

**Purpose:** Align agent behavior with the lean runtime contract and prevent concurrent evidence
writers from colliding.

**Source changes**

- Reduce required reads in `governed-implementation` to root instructions, `docs/index.md`, the
  active plan or owning specification, and the route-selected packs or policies. Do not require a
  fixed list of unrelated architecture and process documents.
- Remove the mandatory execution-topology record for ordinary solo work. Record delegation only
  when delegation actually occurs.
- Remove “code-smell after every coherent packet” from `governed-implementation` and `work`.
- State the exact loop: focused owner test, one affected seam, one impacted pre-commit closeout, and
  one impacted pre-PR boundary before publication.
- State that warnings do not create scope and that the second repeated failure triggers owner
  diagnosis rather than broader refresh.
- Keep architecture review for new or directly changed oversized types. Apply the remediation and
  comment-cleanup budgets from this plan.
- Make independent QA or a second model conditional on selected risk or an operator request, not a
  universal requirement.
- Bound a review to the changed files, active plan, owning contract, and the review-context budget
  above. A reviewer expands context only to answer a named uncertainty, returns at most five
  actionable findings by default, and does not inventory the repository before reaching a verdict.
- In `runner.py` and `execution_flow.py`, create one run identifier and expose
  `PROJECT_GOVERNANCE_RUN_ID`, `PROJECT_GOVERNANCE_PACK_ID`, and
  `PROJECT_GOVERNANCE_EVIDENCE_ROOT` to child commands. Use ignored, run-scoped directories under
  `.governance/runtime/runs/<run-id>/<pack-id>/`.
- Record the run identifier in normalized output and telemetry. The generic runtime does not parse,
  cache, or approve the product evidence stored there.
- Do not add persistent receipt reuse or a resume command in this slice. Existing `--pack` repair
  and one final impacted closeout are sufficient.

**Focused tests**

- Two concurrent or sequential packs receive distinct evidence roots.
- Run identifiers appear in output and terminal telemetry.
- Timeout, interruption, and child cleanup behavior remain unchanged.
- Installed skills contain no every-packet check, exact-fingerprint reopening, unconditional second
  review, or fixed unrelated-read requirement.
- Installed skills still require one focused test, one seam, the impacted boundaries, and the
  architectural-review trigger.

**Owning tests:** `tests/test_runtime_package_execution.py`,
`tests/test_runtime_skill_payload.py`, and `tests/test_runtime_wheel_boundary.py`.

### Slice 7: Reconcile the authority and prove the wheel once

**Purpose:** Finish with one coherent runtime authority and one release-quality proof.

**Source changes**

- Update `docs/system-spine.md`, `docs/governance/validation-strategy.md`,
  `docs/specs/governance-kernel.md`, `docs/architecture/governance-runtime.md`, and the operator
  guide only where the implemented contract changes them.
- Keep these documents short and cross-link instead of copying the implementation plan.
- Update the clean-wheel synthetic target to prove explicit replacement, grouped coverage gaps,
  all-mode wholesale ownership, replacement receipt of the immutable packet, stable architecture
  disposition, changed-only comments, and tuple-diff dependency behavior.
- Inspect the built wheel to confirm no adopter identity, command, evidence, or migration data was
  packaged.
- Remove this active plan at completion and update `docs/exec-plans/README.md`; Git history retains
  the implementation record.

**Focused-to-broad proof order**

1. Run the owning unit module after each slice.
2. Run one directly affected integration-test seam after a slice changes configuration, planning,
   or wheel contents. This is a focused seam, not a wheel build, clean installation, or release
   matrix, and it runs only for the slice that changed that seam.
3. Repair a failed module or pack by rerunning only that owner.
4. At the stable final candidate, run once:

   ```sh
   python3 -m unittest discover -s tests -p 'test_runtime_*.py'
   python3 -m pip wheel . --no-deps --wheel-dir dist
   python3 tools/verify-runtime-wheel.py dist/project_governance_runtime-*.whl
   tools/run-source-governance.sh check --stage pre-commit --mode impacted --staged
   ```

This plan changes selection, configuration, schemas, skills, and wheel contents, so the final broad
source proof is required. The step-4 wheel build, clean installation, and complete runtime test
matrix run exactly once on the stable final candidate; they are not repeated after every slice.

## Acceptance Criteria

- One routine risk has one selected owner. A replaced built-in and its target replacement never
  appear together in an impacted or all-mode plan.
- A replacement coverage problem produces one grouped blocker, not one finding per path or per
  possible proof lane.
- Changed file count does not require proportional policy, waiver, or baseline records.
- The 500-line threshold still blocks a new or unreviewed changed source unit pending architecture
  review.
- A cohesive oversized class can pass without splitting, and its accepted decision survives a
  comment edit, formatting edit, and modest cohesive growth.
- Architecture review still detects and blocks newly mixed responsibilities, harmful coupling, or
  an unreadable orchestration surface.
- The recommended remediation never treats a line-count-only helper extraction as success.
- Untouched declarations in a changed file do not generate maintainability or comment blockers.
- New files and new public or authority-boundary declarations remain fully comment-governed.
- An unchanged dependency tuple never requires new freshness evidence merely because its manifest
  changed.
- The normal repair loop never instructs an agent to refresh every check after one failed owner.
- One stable-candidate integrated proof remains required where risk warrants it.
- No generalized product-proof cache, proof graph, adopter evidence, or second runtime authority is
  introduced.
- No remote publication, release, or adopter write occurs without its own explicit authorization.

## Stop And Rollback Rules

- If a slice requires product vocabulary, commands, paths, or evidence in this checkout, stop and
  move that concern to the adopter-owned lane.
- If explicit replacement cannot remain repository-wide without adding path precedence, stop after
  the grouped coverage-gap contract and seek operator direction; do not build a capability graph by
  default.
- If stable cohesion decisions cannot work without automated semantic invalidation, retain human
  responsibility-change review; do not reintroduce whole-file hash churn.
- If two focused attempts expose the same governance failure, classify it before running a broader
  gate again.
- Before a dependent slice begins, its prerequisite can be reverted as one coherent commit. Once a
  later slice consumes the changed-scope packet, roll back that dependent first and the packet
  slice last. Do not add a compatibility shim to keep both policy authorities active.

## Progress

- [x] Slice 1: one immutable changed-scope packet
- [x] Slice 2: explicit built-in replacement
- [x] Slice 3: durable 500-line architectural review
- [x] Slice 4: changed-code comment ratchet
- [x] Slice 5: dependency tuple diff
- [x] Slice 6: lean skills and run isolation
- [x] Slice 7: authority reconciliation and one wheel proof
- [x] Source implementation and source-repository proof complete

Downstream shadow adoption remains external to this checkout and is intentionally not tracked as
an incomplete source-plan slice.
