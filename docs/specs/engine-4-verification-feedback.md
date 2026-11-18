---
id: spec.engine-4-verification-feedback
title: Next Major Verification and Semantic Review
type: spec
status: current
owner: project-governance
created: 2026-10-04
updated: 2026-10-05
summary: Strengthens complete development journeys, early focused checks and multilingual semantic advice through the existing runtime.
---

# Next major verification and semantic review

## Outcome and authority

The next major release targets 4.0.0. Development begins from the compiled 3.0.0-rc.10.9
runtime. Existing releases, runtime locks and host conversations retain their current owner until
deliberate adoption. Version preparation, publication and adopter updates are separate release
steps; this specification does not certify an archive or switch an installation.

Make ordinary development reach useful checks before expensive review, and prove that the
installed harness can carry a task through entry, execution, consultation and continuation. JEV
adds focused semantic advice over exact supplied evidence. It does not run tests, prove behavior,
approve work, alter required checks or initiate delegation.

The [kernel](governance-kernel.md), [execution contract](engine-workflow-and-device-contract.md),
[provider contract](provider-agent-skills.md), [decision contract](engine-decision-layer.md) and
[RC4 quality contract](engine-decision-rc4.md) remain the implementation owners. This specification
owns the new release requirements, not a second runner, policy language or decision gateway.
The [implementation plan](../exec-plans/active/2026-10-04-major-verification-feedback.md) owns delivery
order and qualification. The [validation strategy](../governance/validation-strategy.md) remains
the proof-cadence owner.

The [research reconciliation](../research/2026-10-04-verification-feedback.md) covers primary sources
for each addition and separates accepted corrections, qualification work and deferred ideas.

## 1. Prove complete development journeys

Use disposable Git repositories and the built package's installed launchers. Fixtures must reach
the public entry points, not replace a failed lifecycle with direct calls to its internal helper.
Reuse existing greenfield, native-provider, startup and runtime-generation proof where it already
establishes the required behavior.

| Journey | Required positive proof | Required refusal or recovery proof |
| --- | --- | --- |
| New repository, first task | Install before the first commit, submit a prompt, deliver required and selected context, bind the task, run a focused check and release owned readers | Missing credentials and provider billing refusal preserve useful fallback; saved evidence does not become live documentation debt |
| Same-worktree upgrade and continuation | End only the fixture's old host ownership, adopt a candidate, submit the same native session with a new process identity and continue through the installed hook | Stale packet references remain historical; an upgrade cannot silently move a native chat or rewrite a task's worktree |
| Concurrent linked worktrees | Each native prompt and task uses its own worktree, index, configuration and generation; shared continuity history retains correct identities | Cross-worktree prompt or packet use is rejected or explicitly diagnosed; ending one fixture owner does not release another |
| Read-only consultation | Required context and exact selected sources reach the configured fixed fixture provider; result identity and cleanup are confirmed | Context refusal, changed source, unavailable provider and unknown cleanup do not become successful reviews or silently choose another route |

Synthetic native events prove the runtime's hook handling, not the desktop application's ability
to reattach a chat. Host-observed prompt delivery and accepted ordinary development remain separate
qualification. Never infer native conversation health from installation, doctor or archive success.
No test may close, archive, reattach or modify a real operator conversation.

Fixture dispatch honors the installed handler's declared deadline and distinguishes timeout from
normal exit. Native qualification records discovered definitions, trust and actual prompt delivery.
Transcript parsing is a version-sensitive usage observation, never task or cleanup authority. A
relabeled copy of one payload proves generation separation only; release qualification uses the
exact published old archive and the actual frozen major archive.

Fixed-model consultation disables both the controlled host's availability chain and its documented
automatic switch after a flagged request. Preserve refusal rather than replacing the requested model.
Qualify supported host versions and retain exact observed-model validation. Administrator/provider
policy remains a declared trust boundary, not a guarantee inferred from one launch setting.

## 2. Give early feedback through existing checks

A coherent implementation batch can run a small project-owned `batch` stage through the normal
`plan` and `check` commands. Stages are already extensible through validation packs. Project
owners declare the affected lint, compile or focused test commands and their dependencies there;
the runtime resolves one immutable subject and returns its ordinary compact result.

Do not infer that a command is cheap from its name, add an automatic full suite to every edit or
Stop hook, or make a model choose whether a required check runs. An undeclared stage, unmapped
affected path, unavailable prerequisite or infrastructure failure retains the existing explicit
blocked/failed outcome. A batch pass establishes only its declared checks; it does not replace
commit, push, local CI, device proof or release requirements.

Use both old and new paths of a rename when selecting pack owners. Pack ownership is not reverse
dependency analysis: the project build owner supplies affected application/dependency closure, or
the stage uses conservative explicit coverage. Qualify shared source, lock/config changes and rename
across ownership boundaries. No new repository graph is introduced.

A captured packet does not make arbitrary tools read captured bytes. Packet-aware changed-file rules,
complete candidate builds and live-checkout diagnostics have different claims. Qualification includes
opposing staged/unstaged bytes and relevant configuration/dependency inputs. Keep missing declared
inputs and incomplete manifests visible rather than treating a source digest as a complete cache key.

When the governed workflow already declares a batch check and a later review, its dependency order
places the check first and carries the result into review. New host automation requires a qualified
entry point; instructions alone are not proof that it ran. Standalone design/document reviews do
not acquire unrelated build requirements. Missing execution coverage is reported, not repaired by
silently launching a new test command.

Existing command supervision, deadlines, compact summaries and retained originals remain the
owners. Build systems own compilation and test caches. No generic successful-check cache, second
batch scheduler, per-edit collector or new pass/approval gate is introduced.

## 2a. Update plan progress deterministically

Use one versioned structure in the existing Markdown implementation-plan template. Give batches
and their implementation, verification and closeout items stable IDs. Keep explanatory prose
flexible. A compact typed declaration maps verification items to existing stages and packs; do not
infer their meaning from checkbox labels. Adopt this format deliberately for new plans or an
explicit conversion. Older plans remain readable and are not silently rewritten.

The runtime reads a selected batch and returns its IDs, states, declared checks and evidence
references. An update names those IDs and the expected exact plan digest. Code changes only the
declared machine-owned checkbox and evidence slots, preserving other bytes, line endings and
permissions. Duplicate IDs, unresolved declarations, a changed plan, unsafe paths or conflicting
ownership cause refusal. Repeated identical requests are harmless. Reuse existing coordination
and atomic-write patterns; these coordinate participating writers, not arbitrary editors.

Implementation completion is an explicit caller declaration. It is not independent proof that the
feature exists. A verification update needs original native check evidence for the declared
workspace, task where bound, stage, required packs and candidate inputs. Refuse failed, incomplete,
unrelated or stale evidence and unresolved native process cleanup. All-mode receipts and incomplete
custom-command input manifests cannot establish current candidate freshness by themselves.
Every required pack must contain an applicable passed command. A lint pack must report at least one
checked file; a zero-work or entirely not-applicable run cannot complete verification.

Normalize parsed machine-owned plan slots when assessing a later bookkeeping-only change.
The approved 4.1 refinement also normalizes explicitly marked commentary; see its
[definition boundary](engine-4-1-context-quality.md#exact-task-to-plan-reference).
Never ignore an entire plan, mask changed requirements, rewrite retained receipts or certify a new
whole-tree digest using old evidence. Verification establishes the declared executed checks, not
general product acceptance. Keep historical results and their limits visible.
Retained references bind the item and whole-spec declarations. Another clone or worktree may lack
the original local store; report that historical proof as unavailable advice rather than blocking
unrelated work. Malformed metadata, changed declarations and contradictions in available originals
still block. An unavailable historical reference can never establish a new completion.

Do not use an LLM or JEV to parse the plan, flip boxes or decide whether a receipt passed. Do not
run checks, stage files or commit as an updater side effect. Compact inspection lets an agent request
one batch without rereading the whole document. Narrative changes and acceptance judgment retain
their existing authors and review process. No separate plan database or background watcher is needed.

The normal documentation pack validates deliberately structured plans when their plan or bound
specification changes, at its already configured stages. Existing unstructured plans are exempt.
The public `implementation-plan inspect --path <path> --batch <id>` command returns one batch.
`implementation-plan update --path <path> --request <file>` applies a typed compare-and-swap request.
The existing `check` command accepts `--implementation-plan <path> --batch <id>`: it validates
the batch before dispatch, executes its declared stage/packs once, then records the original receipt
for matching verification items. Detached checks use the explicit updater after normal observation.
This is an opt-in binding on the existing command, not a new test loop or per-edit hook. Failed
execution, stale source/specification, changed plan or unresolved cleanup leaves the boxes unchanged.

Machine ownership is one `governance-plan` JSON fence and explicit item/evidence markers. The fence
declares version, specification digests, batch dependencies and typed items. Marked checkboxes and
evidence arrays are the only mutable slots. All original source, native command and task identities
remain in their existing records. Normalized bookkeeping permits no new whole-tree freshness claim.
Explicit 4.1 commentary regions are human-owned notes, separate from these updater-owned slots.

## 2b. Structure specification references as a separate workstream

Provide a small reusable specification template with the existing document metadata and stable acceptance-criterion
IDs, such as `R1`. Preserve the problem, intended behavior, ownership, failure cases, non-goals and
verification strategy as readable Markdown. IDs identify requirements; they do not prove them.

Plans reference a specification path and criterion ID from their typed items. The specification owns
intended behavior; the plan owns implementation progress, check mappings and changing evidence.
Do not duplicate completion state in both documents. Bind proof references to captured specification
content; a changed requirement must not inherit evidence solely because its ID stayed the same.
A whole-spec digest is the conservative 4.0 iteration. The approved 4.1 refinement exempts only
explicit commentary regions, keeping all unmarked prose and criteria bound. It retains exact original
file captures and does not infer whether a prose change alters a requirement.

Code can check unique and resolvable IDs, coverage of declared in-scope criteria by plan items,
configured stage/pack references and qualifying evidence. Existing schema checks, compilers, linters
and behavioral tests remain the owners of their mechanical claims. A passing check or a well-formed
evidence manifest alone does not establish every requirement, authenticate every referenced artifact
or prove that the mapped test exercises the intended behavior.

The existing compliance review judges whether requirements and mappings are sound, tests cover the
right conditions, non-goals hold and behavior meets the intent. Do not invent a general deterministic
prose-to-code comparator. No requirements database, new policy language, per-symbol catalog, blanket
new hook or retrospective conversion of untouched specs is introduced. Deliver the plan updater
first; qualify specification linking separately before claiming automated compliance coverage.

## 3. Support semantic review for the actual source stacks

Extend the existing DL01 test-integrity and DL02 code-review evidence capture from JS/TS to
Kotlin, Swift and Python. Recognize conventional test paths and names, including Kotlin test
source sets, Swift test targets and Python `test_*.py` and `*_test.py`. Reuse shared path
classification where its contract agrees; do not call every file under a test fixture directory a
behavioral test or guess intent from an extension.

The accepted validation subject supplies before/after differences and optional source/setup.
Staged review must never substitute unstaged checkout bytes. Keep source permissions, approved
questions, fixed model settings, budgets, cancellation, missing-token fallback and explicit
unknown/partial answers. No new consumer or question is enabled merely by upgrading.

Unknown languages, binary or nonordinary files, unavailable source, omitted differences and
incomplete setup remain visible coverage limitations. A supported extension does not establish
language parsing, complete fixture knowledge or executed regression evidence. Models receive only
the evidence actually captured; coverage reporting must not claim that all changed work was assessed.

Use the current focused questions: requirement support, assertion integrity, behavioral relevance
and supplied-rule adherence. Code owns syntax, identities, permissions and checker outcomes. JEV
can identify semantic concerns or uncertainty; the primary model diagnoses and repairs them. No
JEV response changes a native checker result, suppresses required review or starts another model.

## 4. Convert repeated mechanical findings into checks

The approved [focused linting MVP](engine-linting-mvp.md) and its
[delivery plan](../exec-plans/active/2026-10-05-linting-mvp.md) develop installable adapters, visible
coverage and narrow normal-gate enforcement. They extend this workstream through existing owners.
Source implementation and installed/release qualification remain separate claims.

Use existing linters or a target-owned pack for an adopted, mechanically detectable rule. A new
rule needs a stable finding identity, one violating case, one valid case and a declared scope.
Imported rule text and illustrative advice are evidence, not permission to add enforcement.

Risk-sensitive architecture and test-quality judgments stay advisory unless a deterministic
invariant can actually be proved. Existing violations are baseline debt; normal changed-work
checks must not reopen the whole repository without an accepted policy change. Do not add one
skill or AGENTS paragraph for every convention, blanket coverage percentages, or style bans whose
performance effect has not been measured.

Qualify the project's baseline mechanism. Unchanged debt, a new violation and replacement of an old
violation with a new one at the same count are distinct cases. Include rename/deletion, configuration
change and malformed-baseline behavior. Count-based suppression establishes debt totals, not stable
finding identity. The native tool owns its baseline; checking must not silently regenerate it.

The runtime already supplies target packs and lexical test-quality advice. Show a small reusable
extension example and prove its selection, violations, scope and infrastructure failures. The
project owns the actual stack tool and rule choice; this release does not bundle a Kotlin compiler,
Swift toolchain or Python test runner into governance.

## 5. Establish whether tests detect a known fault

For a few important runtime behaviors, deliberately change a disposable fixture into a known bad
state and require the normal test/check to fail. The corrected fixture must pass through the same
entry point. Include cleanup, worktree identity or continuation where those failures have already
occurred. Retain failure identity and original evidence so a wrong tool invocation cannot masquerade
as detection of the seeded defect.

The seed needs a concrete behavior witness. Compile errors, unrelated assertions and incidental
timeouts do not establish that witness; a timeout counts only when the intended defect is a hang.

Do not add a general mutation framework, universal coverage gate or periodic repository-wide
mutation run. Representative fault cases belong with their existing owning tests. JEV can flag weak
test evidence, but a model's opinion is never the proof that an executed test detected a defect.

## Review delivery and measurement

The [release evaluation contract](engine-release-evaluation.md) defines the common scorecard and
the [reporting workstream](../exec-plans/active/2026-10-04-release-evaluation.md) joins existing proof.
Keep its controlled comparisons, passive field trends and unknown host coverage separate.

The next-major follow-up prioritizes independently labelled selection quality, original outcome/cost
links and one explicit long-build/test-log pilot. Bookkeeping and linting make no model calls.
The quality evaluator scores complete decisive units and required retention, with discovery,
permission and capture omissions counted separately. Labels never become selector input. Its
development and holdout suites stay versioned; successful inference is not a correctness label.

The log pilot starts only at an explicit long native check-output request. Deterministic code protects
failures, result state, cleanup uncertainty and digest-bound original references. JEV may choose
optional routine material. Provider-completion prose and short/structured output stay original.
Use paired code-only and JEV arms with call counts; no general tool-output filter or background judge.

Task projection must retain complete current intent without turning an otherwise valid task unbound
because a criterion exceeds 500 characters or there are more than 16 criteria. Use one complete
32 MiB admission envelope and the existing safe repository-path contract. Do not truncate criteria,
revise the task store or widen provider permissions. Existing egress/request budgets and the operation
deadline remain authoritative; oversized provider input has an explicit fallback rather than erased
task identity. A truly excessive task-context envelope remains an actionable refusal.

Use existing compact results and source references to assemble review evidence: task requirement,
exact changed subject, findings, proof status, remaining unknowns and access to originals. Preserve
required guidance, contradictory findings, execution failures and cleanup uncertainty. Do not create
a duplicate store or replace complete retained receipts with summaries.

Compare code-only and code-plus-JEV on frozen representative changes with known expected outcomes.
Record missed defects, false findings, additional reads, rework, elapsed time and all available
model usage. Provider fixtures establish wiring and fallback, not semantic accuracy or savings.
Live provider comparison requires existing disclosure authorization and caller-owned credentials.
Leave unavailable usage or accepted outcomes unknown. Keep adopter paths and runtime reports outside
this checkout.

Freeze five cases per supported stack: meaningful correct behavior, mock-only assertion, weakened
assertion allowing a known fault, insufficient setup requiring unknown, and a legitimate intentional
change that must not cause a false finding. Add a few negation, option-order, embedded-instruction and
irrelevant-hunk variants. Compare isolated and compatible batched questions on identical evidence.
Expected applicability and semantic labels are fixed before calls from that same evidence; executed
behavior witnesses remain separate. This characterizes the evaluator rather than calibrating new
thresholds from a small sample.

Report total cases and intended defects, sufficient captures, omissions and uncertain/unknown/invalid
or unavailable answers, delivered useful findings, misses and false findings. An omitted expected
defect counts as an end-to-end miss; conditional quality on sufficient evidence is reported separately.
Use an offline manifest referencing existing receipts, model/question identities, labels, coverage
limits and usage. No new collector or repeated online judge is introduced.

## Release acceptance

The release needs focused source proof, the complete declared runtime suite, build and package
boundary inspection, clean installed-package journey proof, independent review and reconciliation.
Actual host/adopter qualification is reported separately. Publication does not require upgrading
active projects, and upgrade tests must preserve other worktrees and conversations. Uncompleted
delivery slices cannot be described as released features.

### Large immutable images in installed Git checks

The ordinary check still refuses source images over 16 MiB by default. A local
operator can set `GOVERNANCE_LARGE_IMMUTABLE_PACKET=1` for a normal Git pre-commit
or pre-push invocation when the selected comparison includes large immutable
images. The installed runtime takes the option at dispatch and records it in its
bound worker request. The expanded pre-commit and pre-push checks have a
15-minute default deadline to finish all their ordinary packs. An exact
immutable pre-push comparison uses the same deadline. Other hook and manual
defaults and explicit command deadlines keep their existing values.

The extension admits regular Git blobs and staged index after-images up to
128 MiB each and caps the complete packet at 512 MiB. Working-tree images,
symlink payloads, unborn comparisons, and non-hook or non-immutable subjects
retain their existing limits. The worker streams each larger blob to a private
image, verifies the object ID, length, and SHA-256, and publishes the ordinary
version-one packet only after every image succeeds. Failure removes unpublished
images and retains a terminal failure with no checker commands started. The
formatter reads its admitted large after-image from that packet and verifies
its length and SHA-256 again. Bounded Git batches verify the framing and object
identity of the smaller immutable images in the same comparison. Existing context and other checker input limits
keep their own owners. This is local validation, with no disclosure or policy
exception implied.

A foreground native `dependencies` check invoked by a checker in this hook can
inherit the option from its live parent. The runtime verifies the parent
packet digest, workspace, runtime generation, deadline and exact comparison
subject. The dependency check resolves the same staged index or the same
committed push candidate. It runs its own check and retains its own findings
under the remaining parent deadline. The option does not propagate to further
children or independently invoked checks.

### Expanded capture for one exact local comparison

A local pre-push check can set
`GOVERNANCE_LARGE_IMMUTABLE_COMPARISON=<base-commit>:<candidate-commit>` for
an immutable comparison that exceeds the ordinary 512 MiB limit. Both object
IDs must match the resolved comparison, including the merge base. A staged,
filtered, unborn or live comparison cannot use this option. The check still
selects and runs the ordinary pre-push packs through one version-one packet.

This opt-in admits at most 2 GiB of logical image bytes, counting every side
even when the same blob occurs more than once. Capture streams large images
and reads small images in bounded batches. It verifies the original Git object
ID, byte length and SHA-256 before publishing any record. Repeated blob IDs
share one private, read-only file through separate packet image paths. The
per-image, worker deadline and cancellation rules still apply.

The policy and approvals are resolved exactly as in an ordinary pre-push
check. The option grants capture capacity only. The live dependency child can
inherit the exact comparison through its existing verified parent link. It
keeps its own packet and results and uses the remaining parent deadline.
The runtime records the bound comparison in the worker request and run intent.

### Proposed admission of npm library ranges

The check may admit a prerelease caret declaration in a staged or committed
comparison when its Git base independently approves the complete target set
and pins the exact selection receipt. The base dependency policy supplies
`npm_range_targets` and `npm_range_selections_sha256`. Current policy also opts
in, and the exact tarball route must be trusted by both policies. Each npm
scope may name one exact HTTPS base or an explicit list of distinct bases.
This lets an adopter retain exact evidence for an older route while adding a
new route for the same scope.

The release owner enumerates the complete expected target set from the verified
signed selections and release requirements before reviewing the receipt.
Each expected row identifies the literal manifest `path`, `field`, `name`,
and `range`, plus the `target` and `selection_id`. It binds the target's
verified `proof_sha256`, `artifact_id`, exact `version`, `origin`, and
`archive_sha256` to its actual `consumer_path` and `consumer_sha256`.
Use an exact target identity from the signed selection, including the
architecture when the release distinguishes it. The checker requires exactly
one matching proof row per expected target. The proof cannot choose its own
coverage or substitute another variant, signed readback, or consumer.

Store the UTF-8 JSON receipt in `dependency-range-selections.yaml` beside the
policy so the ordinary dependency pack observes receipt changes. Its
`version` is 2 and its `selections` array uses the following records.

- `edge` gives the manifest `path`, `field` (`dependencies`), dependency
  `name`, literal `range`, `manifest_sha256`, and `expires_at`.
- `selected` gives the verified `target`, `selection_id`, `artifact_id`,
  `proof_sha256`, exact `version`, tarball URL in `resolved`, and signed
  `archive_sha256`.
- `archive` gives the observed archive `sha256` and SHA-512 `integrity`.
- `lock` binds the approved consumer's sibling `package-lock.json` by
  `path` and `sha256`. Its `name`, `version`, `resolved` and `integrity`
  match the exact top-level package entry.

The release owner verifies the signed selection, availability, and actual
archive bytes before the operator approves the target set and receipt in
the base. The engine checks the immutable consumer manifest and lock together.
Their root name and version and the exact installed dependency pin must agree.
It rechecks the approved range when its manifest, consumer, lock, dependency
policy, receipt, freshness evidence or override changes. Every admitted
exact coordinate still uses the ordinary freshness rules. Candidate policy
and receipt edits can prepare future authority. Only an accepted base grants
authority to the current comparison.

Admitted coordinates use freshness evidence and operator overrides from the
exact registry base in the verified tarball URL. The evidence's exact metadata
URL supplies that base. Two trusted routes may have different release ages for
the same version. Evidence at one base cannot satisfy the other. A matching
digest alone does not establish a cross-route publication date.

### Proposed signed gateway npm integrity

A comparison base may approve `npm_signed_lock_targets` for a verified signed
selection whose gateway emits SHA-256 SRI. Each entry gives `target`,
`selection_id`, `proof_sha256`, `consumer_path`, `lock_sha256`, `expires_at`,
and the signed npm `artifacts`. Each artifact gives `name`, `version`,
`artifact_id`, `archive_sha256` and `size_bytes`. The release owner derives
this inventory from the original signatures and the operator's expected
targets. The check joins the inventory to a base-approved range target,
its captured consumer manifest and its exact lock. The current policy opts
in and trusts the exact selected route.

Retain the whole fetched archive as `<sha256 hex>.tgz` in the runtime state
directory's `dependency-archives` folder, beside `check-runs`. The checker
reads bounded regular files there and recomputes the hash and byte count.
Each listed top-level node must match the signed size and digest, exact
coordinate, verified origin, exact consumer pin and captured lock SRI.
Only those nodes receive SHA-256 admission. Ordinary nodes still use SHA-512,
and each admitted node receives route-bound freshness checking. The checker
leaves archive retrieval and publisher signature verification with the release
owner. The local check uses the accepted base proof and actual retained bytes.

### Proposed source-stage npm range admission

A source promotion can verify a producer relationship before a private build
exists. The comparison base can approve `npm_source_ranges` with a
`projection_sha256` and independent expected `inputs` and `targets` lists.
The input list gives exact repository paths the producer projection reads.
Each target gives the exact manifest `path`, `field`, dependency `name`,
literal `range`, `recipe`, `framework`, `os`, `provider_path`,
`component_id`, `artifact_id`, and emitted `version`.

The source owner derives the projection from the existing producer and its
immutable input graph. Put UTF-8 JSON in `dependency-source-ranges.yaml`
beside the dependency policy. It has `version: 1`, `inputs` with each
`path` and `sha256`, and `bindings` with the same target fields plus
`source_name` and `source_version` from the provider manifest. Review all
expected recipes and OS targets and every input that determines that output.
The check matches those sets to the accepted base, reads the captured producer
inputs, and verifies the provider manifests. The emitted name and version can
differ from the authored package identity when that projection is approved.
A changed producer input selects the existing dependency pack or its declared
replacement, including a change that touches only a resolver file.

This admission clears the exact range syntax finding and emits
`source_range_admissions` as evidence of source ownership. Registry origin,
publication dates and installation enter through private qualification.
Ordinary dependency checks still apply to other entries. When the base also
binds signed consumer proof for a manifest, that proof governs admission.

A protected comparison base can approve a one-use refresh when producer bytes
change and every source binding and input path stays the same. The approval
commit has exactly one parent, the original approved base, and adds only
`config/policies/dependency-source-range-transition.yaml`. The receipt contains JSON with this schema:

```json
{
  "version": 1,
  "prior_base": "<original approved base commit>",
  "candidate_tree": "<reviewed Git tree without the approval file>",
  "previous_projection_sha256": "sha256:<old projection digest>",
  "successor_projection_sha256": "sha256:<new projection digest>"
}
```

Review the exact approval commit through the protected branch's normal process.
The Git comparison proves which approval bytes are in the base. If branch
settings do not enforce independent review, the promotion owner must separately
verify that review for the exact approval commit before using it as the base.
The promotion candidate consumes the approval file in the same change that
updates the projection and its policy digest. Both staged and committed checks
require the approved Git tree, compare the complete source bindings and input
paths against the original approval, and read all successor inputs from the
captured Git subject. The prior projection is the approved scope record. Its
inputs may live only in the prospective source when the earlier approval was
accepted as a policy-only commit. The policy edit is limited to the projection
digest. Deleting or changing the receipt without applying the refresh fails.
Normal nested dependency and other checks still run under their existing limits.

A version-2 receipt authorizes a separately reviewed version allocation on the
same input paths and owners. Only the literal dependency range, emitted version
and provider source version may change. The consumer path, field and package,
recipe, framework, OS, provider path, source name, component and artifact stay
bound to their previous values. A receipt cannot add or duplicate a target.
Version 1 retains its unchanged-binding contract.

Version 2 keeps the four identity fields above and adds two required values.
`workspace_sha256` hashes the UTF-8 canonical root of the named promotion
checkout, without a newline. `binding_changes_sha256` uses the runtime's
canonical JSON digest of the ordered list of changed `{before, after}` pairs.
Each pair contains both complete projection rows. Order the pairs by the
canonical JSON of each row's `[path, field, name, recipe, framework, os]` key.
The reviewer approves the exact pairs, old and new projection bytes, the
original parent, named checkout and complete candidate tree. Verify the hosted
review and protected base before use. The checker verifies the Git and digest
bindings. The hosted review establishes the reviewer's identity.

Both checks require the previous accepted policy and the exact staged or
committed successor. Only the projection digest and versioned source range
targets may change in the dependency policy. Version 2 verifies both the
previous producer hashes, provider identities and consumer ranges against the
immutable comparison base and the successor values against the captured
candidate. Ordinary freshness, signed locks, other dependencies and all
other pack checks still apply. A later refresh or allocation needs its own
receipt and exact review.

### Proposed combined source range refresh

When the existing receipt commit cannot pass ordinary checks on its own, an
owner may review one exact hash-only refresh in a private GitHub issue. The
ordinary review uses a separate reviewer account. An issue author who has
GitHub repository administrator permission may authorize their own exact
transition using the distinct comment `Authorize Project Governance
source-range transition as repository administrator <request digest>`.
GitHub must still identify the person making the decision as an individual
allowed to push the protected target. The target must enforce protection for admins and disallow force
pushes and deletion. The installed checker rereads the open, unedited request,
unmodified approval comment, branch head and protection during each check.
The next local dependency check rejects a closed issue or removed approval
comment. A decision that changes after the check has read it can still race
the Git push.
An issue that has been closed remains ineligible after reopening. Start a
new request and obtain a fresh approval.

The request binds the repository ID, branch, current base, final tree, both
projection digests, every captured successor input hash, and the exact
executing checker lock and archive. The existing refresh restrictions still
apply. The checker also rereads all candidate consumer ranges. In normal push
hooks, the outgoing Git endpoint and target must match the reviewed repository
and branch. The outer hook captures the locator for the nested dependency
check, which uses that value for its live GitHub read. A retry may verify the same tuple while the same base is live.
Once the branch advances, the previous approval cannot authorize another
transition. GitHub requests are read only and occur only when a local Git
approval locator selects this route. API signoff and the other packs retain
their current commands and authority.

The release owner consumes a passing, original `signed_lock_admissions`
receipt at the private consumer qualification step, after committing the
source and acquiring the exact signed candidate. Bind that receipt's target,
selection and proof digest, consumer and lock digests, and archive closure
to the same clean source, plan and built artifact set. It supplies the
signed dependency result for the existing release qualification evidence.
Require the original passing receipt and check complete target coverage.
