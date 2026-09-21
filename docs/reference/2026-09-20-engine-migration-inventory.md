---
id: reference.engine-migration-inventory
title: Development Engine Migration Inventory and Dispositions
type: reference
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Source-backed category inventory of established behavior, its intent, proposed treatment and cutover proof.
---

# Migration inventory and proposed dispositions

## Scope and evidence

This inventory supports an aggressive replacement of the shared runtime, evaluated by category rather
than a mechanical language port. Preserve useful intent; replace mechanisms that no longer earn their
cost. Each recommendation below is reviewable separately. No category is approved for feature removal
merely because it is listed as redesign or retire.

The [source snapshot](2026-09-20-engine-migration-source-snapshot.json) assigns all 352 tracked files in
its declared scope to a category, with current-byte hashes and no unassigned files. Scope includes the
runtime and shipped payload, TS core, source/installed Git hooks, source host/configuration files,
source CI/release tooling and tests. It is a path-level completeness check, not proof that every line
was semantically audited. Generated artifacts, live installations and adopter-specific extensions are
outside this inventory. Their read-only audit is an explicit pre-cutover requirement.

Intent was checked against live contracts, implementation entry points, pack definitions and tests,
plus the [lean operating-model closeout](../exec-plans/completed/2026-08-27-lean-governance-operating-model.md).
That history explains why thin hooks, focused proof, independent CI, bounded context and removal of
agent-control paperwork matter. It does not forbid a useful execution engine; it does warn against
reintroducing role registries, automatic review ladders and per-skill compliance receipts.

## Treatment vocabulary

- **Retain:** keep the responsibility or authored asset; adapt its integration only.
- **Port:** preserve specified observable behavior in TS, with parity fixtures.
- **Redesign:** preserve intent, replacing its data flow or mechanism; adjudicate behavior changes.
- **Replace:** choose a better maintained implementation for the same responsibility and prove coverage.
- **Retire:** remove only after its purpose is fulfilled elsewhere or explicitly judged unnecessary.

These are implementation dispositions, not permission to relax policy. A pure-output comparison may
run both implementations; a side effect has exactly one owner. A category may have several treatments.

## Category decisions

| ID / category | Established intent and current owner | Recommended treatment and reason | Required cutover evidence |
| --- | --- | --- | --- |
| C01 Task, action and evidence history | TS task revisions, attempts, action authority, SQLite, artifacts, checkpoints, fork/reconcile/export | **Retain/refactor** into shared change state; preserve proven concepts instead of rewriting TS for novelty | Old schema/history and artifact readback, byte budgets, stale evidence, unknown outcomes, concurrent observers; no inferred acceptance |
| C02 Selection and immutable subjects | Python planning, changed paths, validation subjects, evidence manifests | **Port and unify** with proof planning; one source/policy identity across hooks and workflow | Staged vs live vs base/branch inputs, deletes/renames, dependency ordering, unmapped paths, empty-command refusal, target pack replacement |
| C03 Deterministic execution | Pack runner plus test-batch adapter using shared worker ownership | **Redesign** as approved workflow transitions; port lifecycle invariants once with C04 | Idempotent submit, durable-before-dispatch, cancellation, crash/reconnect, dependency blocking, confirmed cleanup; no duplicate command |
| C04 Provider agents and completion | Native Codex/Claude/Gemini adapters, worker/guardian, private job registry, completion delivery | **Port adapters; consolidate shared lifecycle** with C03, retain native agents' tools/configuration | Model/effort precedence, capability disclosure, shared-reader/cooperating-writer coordination, native session follow-up, queued vs consumed notice, no rerun on delivery failure |
| C05 Git and task hooks | Four shipped Git launchers; optional native startup handlers | **Replace launchers**, preserve boundary intent; one core API called from thin adapters | All hook inputs/subjects, user hooks retained, worktree-local narrative drafts, subagent exclusion, no update/download from a Git gate |
| C06 Format, naming, prose | Deterministic format/naming checks and advisory prose | **Port small unique rules; replace overlap with native tools where useful** | Existing ratchets/waivers, protected authored text, scope and findings; any changed blocking policy requires a separate decision |
| C07 Maintainability and comments | Declaration analysis, native adapters, 500-line review trigger, changed-declaration comment rules | **Redesign orchestration; retain native parsers and explicit judgments** | Parser-free fallback, exact changed declaration scope, cohesive-unit acceptance, temporary waiver replacement/resolution; no forced arbitrary splitting |
| C08 Secrets and dependencies | Secret detectors/waivers; dependency freshness/hash/registry rules; Apple dependency checks | **Port with strict parity first**, modernize internals later | Exact detector/source identity, expiry, tracked-secret scan, introduced-vs-unchanged dependency behavior, local workspaces, scoped registries, Apple exceptions, unknown/infrastructure failures |
| C09 Documentation, narratives, test quality | Docs metadata/link checks, commit/PR narrative validation, advisory lexical test signals | **Retain contracts, port validators**; keep editorial judgment distinct from deterministic defects | Required narrative fields, PR live body/title, docs routes/references, test lexical findings stay advisory while malformed/failed execution blocks |
| C10 KMP surface validation | Opt-in adopter graph/catalog validator; no test execution | **Retain optional capability and port validator**; consume results through proof view | Target completeness, immutable subject consistency, route vs guarded claims, disabled-by-default behavior; references do not become passing proof |
| C11 Context, skills and developer docs | Deterministic routes, exact bounded skill materialization, catalog, shared corpus and third-party notices | **Redesign retrieval around shared map; retain useful corpus and licences** | Required context survives, exact source bytes, bounded reads, corruption recovery, no provider-specific duplication, unknown/missed route reporting |
| C12 Install, update, repair and runtime access | Wheel lock/bootstrap, init/doctor, managed instructions, generation readers, optional compatible startup update | **Replace packaging/internals in a coordinated transition**; preserve installation and recovery outcomes | Exact artifact/dependencies, one lock, preserved authored files, offline installed checks, interrupted activation, active reader/job exclusion, unrelated Git state preserved |
| C13 Measurement | Bounded content-free validation telemetry and usage observations | **Redesign as common event projections**, carry existing metrics and unknowns | Deduplication, dropped-data reporting, retention/full/locked failure isolation, native-usage coverage and frozen evaluation joins |
| C14 Policy schemas, findings and exceptions | Profiles/defaults/schema validation, finding lifecycle, waivers/dispositions, authored entry rules | **Retain intent; normalize typed definitions** under one owner per rule | Blocking vs advisory vs accepted/waived/suppressed, expiry, exact subject binding, schema failures, no model-authored enforcement changes |
| C15 Tests, release and source workflows | Python/TS fixtures, clean-wheel verifier, source archive proof, pinned CI actions, release metadata | **Reuse cases; replace harness/packaging where needed; separate CI proof from compute placement** | Required behavior matrix, exact integration candidate, clean installed proof, source/artifact parity, trusted check publication/readback, stale base/head refusal; release authority remains separate |
| C16 Public commands and wire contracts | `project-governance`, `harness`, `harness-agent`; versioned JSON and exit statuses | **Consolidate internals; retain useful entry semantics** with a deliberate major-version contract | Machine outputs, version refusal, pending/blocked/failure distinction, documented command mapping, consumer update; no permanent compatibility layer |
| C17 Optional semantic/memory integration | Proposed JEV adapter, inert token example; future Mnemos projection | **Design interfaces now; implement JEV early and Mnemos later**. E5 batch A carries identity/projection semantics; batch C carries the JEV seam, with E3 comparison and E6 real memory adoption | No-token zero-network fallback, data scope, time bounds, model/input identity; memory lifecycle/freshness/tombstone contract before adoption |
| C18 Project runners and resources | Adopter-owned builds, tests, Metro, simulators, devices, ports, build outputs and optional local-CI/container/VM providers | **Assess then reuse/repair/replace in the owner**; retain one planner/catalog and qualify placement separately | RN iOS simulator then physical scenario, stale Metro, exact build/bundle/target; one host resource authority across participating repositories/versions; isolated candidates, environment profiles, capacity leases, bounded fallback, crash/reconnect and cleanup |

C18 has no generic runtime source implementation to inventory here. C17 has only the inert setup
example in the selected source snapshot; the reviewed runtime roots contain no implemented JEV adapter.
Do not create a migration work item for a nonexistent live JEV subsystem. Historical proposals remain
research; any separately installed legacy integration must be discovered in the adopter audit.

C03/C04 share worker lifecycle implementation today. They are separate capability decisions, not
instructions to port the supervisor twice. C14 includes shipped default policies/schemas and source
host entry files; payload preservation and target-owned policy migration are different obligations.

C15/C18 now include the [local-CI and merge contract](../specs/engine-local-ci-and-merge-contract.md).
Independent CI means trusted candidate/policy/result validation; it does not mandate hosted compute.
The operator settled support for both remote and local CI and reports GitHub authorization already
in place. Inventory the existing integration rather than reopen that product decision.
Existing adopter VM/container work remains project-owned evidence, not additional generic source in
the 352-file snapshot. Assess it for reuse without promoting a pre-push mirror into merge authority.

The [capability pressure test](../specs/engine-capability-boundaries.md) also exposes release needs
within C03/C12/C15/C18: external-operation lifetime, optional capability/version discovery, evidence
custody and target ownership. These are design inputs, not additional implemented source in the
snapshot or a mandate to migrate an adopter's entire release system. Project release commands and
policies remain with their owner. Full release implementation is deferred beyond the first core slice.

## Every shipped validation pack

The 13 definitions under [packs](../../src/project_governance_runtime/packs) are all accounted for.
Pack enforcement and an individual finding's severity are different; specifically, the test-quality
pack is blocking for infrastructure failure, while its lexical quality signals are advisory.

| Pack | Current posture and purpose | Migration category / specific preservation |
| --- | --- | --- |
| `format` | Blocking deterministic format defects | C06; scope and format-preservation behavior |
| `naming` | Blocking policy for new/renamed names | C06; package-aware rules, existing-debt ratchet and waivers |
| `maintainability` | Blocking enforcement with review/disposition path | C07; native declaration ownership, cohesive acceptance and fallback |
| `comments` | Blocking changed/new declaration contract | C07; existing overview debt and unsupported-language advisory posture |
| `secrets` | Blocking, supplemental | C08; changed-file pre-commit vs tracked-surface later scan; exact waivers |
| `dependencies` | Blocking selected dependency policy | C08; publication age/evidence, hash-lock rules, trust and local workspace identities |
| `apple-dependencies` | Blocking Apple-specific policy | C08; actual packet scope and explicit reviewed exceptions |
| `documentation` | Blocking deterministic document defects | C09; metadata, IDs, links and current authority routing |
| `commit-message` | Blocking supplemental commit boundary | C09; meaningful subject/body from Git-supplied file |
| `pr-description` | Blocking supplemental pre-PR/CI narrative | C09; title/body-only shipped pre-PR, live provider values in CI |
| `test-quality` | Blocking pack; lexical findings advisory | C09; signal is not proof of test correctness, tool faults remain blocking |
| `prose` | Advisory prose style | C06; never silently promote to blocking or let it decide technical correctness |
| `context-router` | Blocking route/configuration integrity | C11; valid narrow routing, installed skill references and instruction ownership |

`kmp-surface-validation` is a shipped built-in command, not a fourteenth enabled built-in pack.
A target-owned pack explicitly enables it. Adopter `project_extensions`, replacements and custom
commands must be enumerated in the adopter audit; a source-only inventory cannot certify that closure.

## Hook and process intent map

| Boundary | Current behavior / reason | Target behavior / proof |
| --- | --- | --- |
| `commit-msg` | Authored narrative supplied by Git | Retain cheap narrative-only check; message repair does not itself require code-validation replay |
| `pre-commit` | Staged impacted proof, changed-file secrets | Preserve staged subject even with unrelated dirty bytes; missing runtime gives one actionable failure |
| `pre-push` | Branch-aware impacted sign-off and tracked secret scan | Preserve one local sign-off; no identical manual call immediately before hook |
| shipped `pre-pr` | Explicit `pr-description` only; not a native Git lifecycle event | Keep explicit launcher/integration and worktree-local drafts; do not accidentally activate every pack declaring generic pre-pr |
| generic `ci-pr` | Independent provider candidate/environment; live narrative | Preserve separate trust/subject; never waive it because local proof passed |
| explicit `release` | Broad applicable proof and artifact/destination identity | Preserve release scope, pinned artifact and actual readback; not a normal per-edit gate |
| `SessionStart` | Opt-in top-level startup/update assessment | Separate continuity attach from optional update discovery; avoid repeating either through two owners |
| `SubagentStart` | Handler excludes delegated children from update discovery | Preserve exclusion; delegation does not create update/worktree authority |
| `UserPromptSubmit` | Reconcile existing startup session/reservation without repeated discovery | Preserve bounded useful context; no model/network call for every routine event |
| `SessionEnd` | Release calling startup reservation | Do not infer that detached jobs ended or release their resources |
| direct wait / queued completion | Observe an existing job using one qualified return path | No model polling; delivery failure cannot resubmit work; queued is not consumed |
| update transaction | Exclusive replacement, reader protection, lock-only isolated commit and journal recovery | Preserve active jobs/readers, user index/worktree, hooks/signing and post-commit recovery semantics |

Sources: [hook taxonomy](../governance/hook-and-check-taxonomy.md),
[installed hooks](../../src/project_governance_runtime/assets/.githooks),
[startup adapter](../../src/project_governance_runtime/startup_integration.py),
[startup runtime](../../src/project_governance_runtime/startup.py),
[test execution](../specs/test-execution.md) and [update contract](../specs/startup-runtime-updates.md).
Registering a hook in source does not prove a particular host has activated it.

Source-repository CI is separate from the generic `ci-pr` stage. The current source-readiness workflow
runs on opened/reopened/ready-for-review PR events, while narrative CI also handles edited/synchronize.
The new release design must explicitly choose source-readiness invalidation on new commits; do not
copy that trigger difference without a decision. Release runs on version tags, serializes publication
and verifies the package. Preserve pinned actions and candidate binding when replacing wheel proof.

## Rules whose intent must survive

| Rule family | Intent to preserve, even if mechanism changes |
| --- | --- |
| Input identity | Staged/changed/branch/live scopes are distinct; no live-checkout fallback for immutable proof |
| Finding integrity | Failed, malformed, interrupted, timed-out or incomplete execution cannot be made green by a waiver or advisory pack |
| Check applicability | Named pack, lifecycle stage and input subject are independent; required dependencies and no-command failures remain visible |
| Required context | No semantic ranker, index or memory provider may drop mandatory instructions or grant authority |
| Scope and delegation | Operator task choice precedes project model policy and defaults; no silent model/effort substitution; a new workspace needs its actual authorization |
| Ratchets | Changed declarations/dependencies receive focused enforcement; unrelated historic debt must not become a migration-induced blocker |
| Exceptions | Preserve reviewed intent, subject/identity, reviewer, expiry and resolution; never silently refresh a waiver to new bytes |
| Timings | Targets/operators own execution deadlines; observer timeout is not execution timeout or cancellation |
| Resource cleanup | Known process exit is insufficient for project/device cleanup; unresolved effects retain ownership and evidence |
| Retention | Reclaim only safe owned scaffolding; never prune live work or target evidence to satisfy telemetry budgets |
| Installation | Exact artifact and one lock authority; no hidden download/update in ordinary gates; authored instructions survive |
| Acceptance | Tests/results, provider opinions, local proof and user acceptance remain distinct |

Default numeric thresholds and detailed stage/path mappings are captured by their exact source files
in the snapshot. They are not silently reset to new defaults during migration. Revisit them by rule
family and representative false-positive/missed-defect evidence, rather than copying or deleting them
wholesale. No new approval form or per-tool compliance receipt is proposed.

## Aggressive migration proposal

Build the selected TS replacement in coherent source batches, then use one coordinated breaking
runtime/package cutover for the required core. Keep the old installed runtime intact until then.
E1a proves source seams; E1b records actual baseline/instrumentation and thresholds before comparing
candidates. Cutover requires measured useful workflow benefit plus parity, final-package qualification
and an accepted N12 recovery policy. Failed or inconclusive comparisons retain the installed product
while the affected intervention is repaired or its scope reconsidered.
Do not release a succession of wrappers that permanently retain both languages. Optional features
may follow later only when explicitly listed as such; existing critical checks/hooks cannot disappear
behind an unsupported result and still be advertised as migrated.

Before each category decision, name the retained intent, selected implementation, intentional behavior
changes, regression cases, state/consumer migration and old files to retire. Development order follows
risk: subjects/policy → state/execution/resources → RN simulator → RN physical; context and JEV work
can proceed independently once common identities exist. Release closure includes the chosen checker,
hook, provider and installation capabilities, not just the first device workflow.

Preserve tests as behavior evidence; port fixtures and compare pure outputs rather than translate test
counts. Differences require a recorded intentional disposition. Add new worker crash/race and installed
package proof where architecture changes create gaps. A failed comparison is not automatically a bug
in the new design, and the old result is not automatically ideal.

Live jobs remain under their original owner until drained/reconciled. Preserve task history, referenced
artifacts, waivers and unresolved states. Migration must be restartable, verify readback before activation
and refuse incompatible downgrade; a prior package alone is not rollback after a schema change.

## Next operator decisions

| ID | Decision | Recommendation and reason |
| --- | --- | --- |
| N1 | Release migration shape: coordinated TS core cutover or many mixed-runtime releases? | One major cutover after category proof; aggressive end state without a prolonged compatibility layer. Existing installation remains usable during construction. |
| N2 | Which checker semantics change in the migration release? | Preserve security/dependency/subject/exception behavior. Redesign C06/C07 internals with native tools; retain current enforcement until a rule-specific change is accepted. Evaluate naming/comment/size friction separately rather than weaken them by default. |
| N3 | Native provider helpers in the first TS cutover? | Carry Codex/Claude/Gemini adapters and completion semantics through the common lifecycle. They are established capabilities; rebuilding only device execution would leave an incomplete migration. Live unavailable-provider coverage remains explicit. |
| N4 | Physical-device priority and safe recovery scope? | RN iOS wired first, then wireless qualification; permit only recipe-declared recovery on owned resources. Never kill another project's Metro or reset an unspecified device/app state. Native iOS follows these RN lanes. |
| N5 | Packaging and automatic updates across the break? | One pinned compiled Node artifact and deliberate major adoption. Preserve opt-in compatible startup updates only after new-format activation/recovery proof; never treat an existing opt-in as permission for the major migration. |
| N6 | Source-readiness CI on new commits? | Cancel obsolete source jobs and qualify the latest candidate on synchronize/ready events, with focused selection where valid. Keep narrative CI separate; old PR-opening evidence cannot certify changed source. |
| N7 | First Mnemos scope? | Repository-scoped task/evidence/procedure retrieval, opt-in later. Define namespace and explicit sharing boundaries now; cross-repository memory is a later selected scope, never implicit global search. |
| N8 | Dual-CI direction settled; how does the engine preserve the installed integration? | Support traditional remote and developer-local CI. GitHub local-CI authorization is operator-confirmed. Inspect and consume its existing producer/check/candidate contract; qualify adapter parity. Introduce a new publisher or change required statuses only if the actual integration needs it. |
| N9 | Which local environments may produce required proof? | Begin with approved maintainer hosts as controllers and isolated Linux containers/guests plus a self-contained macOS VM for selected non-release claims; no direct candidate access to host devices/services/shared outputs in the first pilot. Explicitly accept host-administrator trust; use separately administered capacity where stronger independence is required. Qualify throughput profiles separately from constrained tests; keep physical devices with their host owner initially. |
| N10 | Unavailable local capacity and cost limits? | Keep configured hosted fallback for contributors without local setup. Bound start wait and allow at most one replacement for infrastructure failure within an agreed budget; ordinary test failure stays failed. Without authorized compatible capacity, report blocked rather than wait indefinitely or spend silently. |

| N11 | Accept D5's exact executable-policy authority boundary? Needed before promoting C14/batch A. | One code/declaration owner implements each accepted machine rule; Markdown retains rationale, judgment and authority to change rules/exception policy. Amend CHARTER, AGENTS and owning contracts with the first promoted owner, after this decision. Existing authority remains effective during fixtures. |
| N12 | Post-activation recovery after new records exist? Needed before batch-D activation design closes. | Reversible activation before new writes; afterward quiesce and forward-repair without losing new history/proof. Declare soak duration/workload and recovery owner, prove export/readback and interruption recovery. If downgrade after writes is required, explicitly fund and prove a reverse path; an export alone is not an old-runtime-compatible store. |
| N13 | Must the engine initiate merges in the first CI pilot? Needed before its scope freezes. | Start with validated publication and observation of operator/platform-initiated protected merges. Keep candidate freshness and destination readback mandatory. Preserve existing authorized merge paths; add engine initiation only as an explicitly selected capability with its own authority/recovery proof. |

The approved implementation direction adopts the recommended N1–N13 dispositions and the C01–C18
treatments above, as recorded in the active plan's “Active implementation” section. These are accepted
design choices, not completion receipts or permission to publish. N11's wording change accompanies
the first promoted policy owner; N12 requires a concrete soak/recovery declaration; N13 does not
authorize engine-initiated merges. Per-category proof and deliberate behavioral changes remain gates.

The full C01–C18 table is the category decision menu. N1–N13 are the choices that most affect the
next implementation chunk, with N8's product direction now settled; they do not require relitigating
every already preserved invariant. D14 recommends the small extension boundary now. Release-store,
approval and provider choices stay with a later release slice, not a new first-iteration decision queue.

### Legacy launch-script retirement

The coordinated wheel-to-compiled transition retires the backed provider launcher and the exact
shipped `tools/governance-bootstrap.py` and `tools/governance-startup.py` identities. All present
members must match verified backup bytes and permissions before any deletion. Customized script
versions require deliberate reconciliation; sharing a filename is not deletion authority. Final
admission refuses remaining legacy entry points. Native hook migration and declared command dependency
checks remain required independently of file retirement.

Before new runtime writes, recovery restores these backed files with original permissions and
refuses unrelated replacement content. This retirement does not remove the old Python environment,
external stores or evidence archives; those require their own scoped disposition and readback.

### Continuity command migration

The compiled product exposes retained task/history operations through `project-governance harness`:
`task`, `resume`, `checkpoint`, `context`, `artifact`, `budget`, `paths`, `status`, `reconcile`, `usage`,
`export`, `import` and `events`. Existing arguments and JSON remain owned by the canonical continuity
module. For example, create with `harness task create --outcome TEXT --scope PATH`, resume with
`harness resume --task ID --session ID`, and export with `harness export --task ID`. These operations
share the existing task store; installation-generation admission treats them as writes because store
migration and session bookkeeping can occur on otherwise observational commands.

The compiled entry does not expose the old continuity `check`, `recover` or `governance` adapters,
which depend on the retired execution owner. Their command mapping and preserved in-flight execution
history still require C03/C16 closure. Use the unified workflow/check surfaces for new execution.
Host installation and lifecycle use `host-instructions` and `startup`; the old continuity installer
is not a second installation authority. The source module's standalone CLI remains available to the
current wheel until coordinated cutover. This partial command mapping is not full C16 acceptance.

### Standard continuity-store discovery

The project migration plan includes read-only continuity inventory at the Git-common-directory default
store. It does not create or upgrade a database. Supported retained schemas are inspected in one read
transaction; unknown schemas refuse discovery. Task/action counts and bounded unresolved action IDs
are scoped to the exact recorded worktree. Prepared actions and authorized execution bindings remain
visible even without a job ID. This inventory does not contact an old executor or settle an action.

The default store is inspected, not automatically added to the project-file backup. Explicit custom
store paths still require inventory and coherent backup. A clear ledger is not proof of stopped
processes; the existing owner-drain and external-history requirements remain independent cutover gates.

## Public command reconciliation: native preview

This is an implementation inventory, not acceptance of omitted behavior. The Python CLI parser,
canonical continuity parser and native engine CLI are the comparison sources. A matching command
name alone does not prove matching output, side effects or consumer compatibility.

| Existing entry | Native preview owner | Remaining acceptance work |
| --- | --- | --- |
| `plan` selection | `plan` with native subject/pack planner | Compact JSON summary qualified through the compiled public CLI |
| `check` selection and execution | `check`, `check-status`, `check-cancel` with detached owner | Compact summary and full `--json-output` qualified; detached file export explicitly refuses before dispatch |
| Check trigger and expected status | `check --trigger`, `--expected-status` | Detached preservation and expected-status reporting qualified in compiled tests |
| `telemetry status`, `telemetry review` | Native run metrics and result-bound annotations | Native command proof exists; old retained telemetry history and field-level comparison are not implied migrated |
| `context --task` | `context-route` plus `context-packet` | Different required inputs and outputs; document consumer conversion and compare required-context coverage rather than claim an alias |
| `doctor` | Native runtime doctor plus selected capability checks | Compare findings and actionable remedies with installed adopter facts |
| `docs init`, `docs route` | Native documentation installation/routing | Catalog and installed-documentation consumer readback must match final release identity |
| `init --refresh-launchers` | Request-bound `init` / `repair` | Document prepared-request creation and repair procedure; old invocation is not retained |
| `update --to --dry-run/--apply` | Prepared, digest-bound `update` | Document artifact selection, preparation and completion; not a flag-compatible replacement |
| `startup` | Native startup command and host integration | Native project trust and actual event delivery remain unqualified |
| Continuity task/history commands | `harness` canonical parser | Task/resume/checkpoint/history routing is exposed; consumer/wire reconciliation remains required |
| `harness governance plan` | Canonical planner delegation and task receipt | Explicit and conventional-launcher compiled proof exists; live installation is not implied |
| Legacy continuity `check`, provider `harness-agent` | Native workflow/provider commands | Publish explicit operation/field/exit mapping and old-history readback; do not expose the old supervisor as a compatibility layer |

Prioritize actual result consumption and required-context coverage before cosmetic flag parity.
Generated caller commands, installed hooks and documentation must change with their owning category.
The unsupported or ignored behaviors above remain open until implemented or deliberately accepted;
this table does not authorize dropping them. A final C16 pass must include protocol/version refusals,
exit states and wake/no-wake consumers, not only this top-level CLI inventory.

### Context consumer conversion

The replacement for routed `context --task TEXT` is:

```sh
project-governance context-route --task "Fix the reported launch failure" --revision task-revision-id
```

Carry old explicit `--changed-path` arguments and `--include-expansion` when requested. Supply
`--staged` when the intended guidance must come from the index; otherwise the command captures the
current worktree relative to HEAD. The revision is caller-provided receipt identity, not proof of a
continuity-store revision or action permission. Consumers must use their actual task revision and
check `ready`, `blockers`, `omissions` and the CLI exit code before treating guidance as complete.
Native output is JSON; receipts retain identities without source text. `context-packet` is a separate
explicit-source packet operation and does not replace mandatory profile routing.

Default and primary context, active plans and required skills are deterministic inputs. Optional
`--optional-path` or `--discover-path` candidates may receive JEV ranking within the remaining budget.
No token uses the lexical fallback without network access. A missing required file/skill blocks the
packet before optional advice. Source changes during advice refuse the packet. Compiled tests cover
these boundaries, including an auto-mode configured provider with no token; this establishes bounded
required-context delivery, not complete legacy output-field compatibility or measured token savings.


## Installed definition readback and format coverage

A current read-only adopter audit compared all parsed fields of 13 installed built-in packs and
12 target packs with the source corpus under the native loader. All fields matched except the
source format pack's additional `.env.example` and `bin/*` globs. Exact adopter paths, definitions,
hashes and comparison output are retained externally. This is definition parity, not execution
or semantic parity of every checker.

C06's native formatter now honors those source globs for environment examples and UTF-8 text bin
entries. Arbitrary binary bin entries are excluded from whitespace checking. Known text extensions
retain strict decoding even inside bin directories; malformed shell source cannot silently pass as
an excluded binary. Four focused tests pass, including staged-byte enforcement, preserved notice
identity and the additional path coverage. Installed final-artifact qualification remains pending.

The installed Git gates still call the installed runtime and the native task-hook configuration
still references the old startup owner. These observations belong to C05/C12 activation preparation;
configuration presence does not prove native event delivery or completed cutover.

## Checker source audit — C06–C11

The coherent source audit passed 81 tests with no failures or skips. Test names alone were not used
as category evidence: the audit inspected assertions for the boundaries below. A separate direct
comparison of Python `stream_detections` and the TS scanner matched detector IDs and byte hashes
in 24 positive, negative, binary and 64-KiB boundary cases. Runtime logs and hashed test-input
inventories remain in external evidence.

| Category | Verified source behavior | Canonical test owners under `components/engine/test/` |
| --- | --- | --- |
| C06 | Format scope and preserved upstream bytes; staged whitespace; naming debt versus new names; exact attributed expiring waivers; prose stays advisory | `format.test.ts`, `naming.test.ts`, `advisory.test.ts` |
| C07 | Captured declarations, native parser failures, changed versus existing comment debt, cohesive acceptance, source-bound temporary waivers and explicit disposition transitions | `comments.test.ts`, `comment-rules.test.ts`, `python-comments.test.ts`, `kotlin-comments.test.ts`, `native-analysis.test.ts`, `maintainability.test.ts`, `quality-dispositions.test.ts` |
| C08 | Detector/hash parity; index and worktree union; exact current secret waivers; narrow versus full scans; release-age and unknown-evidence policy; registry/lock identity; local workspace scope; Apple work-bound exceptions | `secrets.test.ts`, `secret-scan.test.ts`, `dependencies.test.ts`, `dependency-*.test.ts`, `apple-dependencies.test.ts` |
| C09 | Narrative fixture findings and Git-supplied message binding; document metadata, calendar validity, graph links and catalog ownership; lexical test findings remain advisory | `narrative.test.ts`, `cli-narrative.test.ts`, `document-*.test.ts`, `structured-document.test.ts`, `cli-documentation.test.ts`, `advisory.test.ts` |
| C10 | Target-local route obligations, staged references, guarded proof gaps, malformed graph refusal and no implicit enablement | `kmp-surface.test.ts` |
| C11 | Required routes and skills retain priority, absent mandatory material blocks readiness, packaged ownership cannot be replaced by target skills, source changes invalidate delivery | `context-routing.test.ts`, `context-route-command.test.ts`, `skill-catalog.test.ts`, `skill-selection.test.ts`, `routed-skills.test.ts`, `skill-read-command.test.ts` |

The same 81 assertions also pass against the installed preview modules and shipped defaults/skills.
The temporary test harness relocates imports to installed code; only the legacy skill-selection
comparison uses the Python source as an expected-result oracle. Two harness setup failures were
retained and corrected (Node forbids stripping test TypeScript inside `node_modules`; relocated
tests also needed explicit installed dependency and asset paths). No runtime change was needed.

This closes the listed source and preview-package behavior audit; it is not a blanket assertion of every historical edge
case or native toolchain on every platform. Final installed artifact qualification, adopter-specific
policies/extensions and native host delivery remain separate E5 acceptance work. No existing policy
was relaxed by this audit, and no further source rewrite is justified solely by an unchecked
historical category box.

## Additional core-contract evidence reconciliation

The current coherent source suite exercises these assertions. These rows identify what the tests
actually establish; they do not close installed activation or whole-workflow benefit by inference.

| Category | Inspected source assertions | Remaining installed boundary |
| --- | --- | --- |
| C01 | `continuity-migration-inventory.test.ts` reads absent and existing stores without creating, upgrading or settling them; filters unresolved actions by worktree and refuses unknown schemas | Reconcile the selected installation's actual stores and preserve their records at cutover |
| C02 | `change-subject.test.ts` retains staged blob bytes after later index edits; distinguishes rename/delete/symlink subjects; rejects stale worktree reads and outside paths; reads unchanged graph inputs from the immutable base | Bind installed results to the actual selected subject and configuration |
| C04 | `provider-assignment.test.ts` compares all three access-mode prompts against the retained Python owner; `completion-delivery.test.ts` retries failed delivery without executing the command again, keeps queued distinct from consumed, and refuses changed executable/evidence identities | Native host delivery and consumption require their own receipts; simulated queue proof alone is insufficient |
| C05 | `git-hooks.test.ts` preserves literal Git arguments and exit status, refuses missing runtime, retains staged/commit/pre-PR selection and worktree-local narrative drafts | Verify the host's effective source and exact handler trust; writing a worktree hook file does not establish that the host discovers it |
| C13 | `telemetry-projection.test.ts` checks deduplication, bounded retention, conflicting identities, locked/unsupported storage and preservation of operational proof; `check-telemetry.test.ts` separates cancellation, missing projections and invalid reviews while leaving unknown token totals unknown | Whole-workflow accepted outcomes and attributed token savings need measured consumer evidence |

Hook qualification must inspect effective discovery independently from the configuration file's
location. If a native host selects a shared checkout's hook source for a linked worktree, do not
silently expand adoption to that checkout or report worktree-local activation as complete.

## Remaining category reconciliation for explicit preview execution

These rows complete the category map; source contracts and actual device evidence are separate.
Shared automatic startup and its instruction transition remain operator-deferred adoption work.

| Category | Implementation and proof owner | Qualification boundary |
| --- | --- | --- |
| C03 | `workflow-store.test.ts`, `workflow-executor.test.ts`, `workflow-worker.test.ts`, command recovery/cancellation tests: durable binding, dependency blocking, retained ownership and same-job observation | Installed simulator and wired-device execution/cancellation receipts supply actual workflow proof; no remote effect dispatch |
| C14 | `schema-validation.test.ts`, `captured-packs.test.ts`, `quality-dispositions.test.ts`: shipped constraints, captured policy and exact exception identity | N11 is recorded in CHARTER, AGENTS and D5. No model can alter enforcement; existing installed owners change only at deliberate cutover |
| C15 | `integration-candidate.ts` and its tests bind head/base/integration commits, plan/policy, producer evidence, profile admission and publication readback. Release workflows build the compiled archive and run offline installation proof | CI seam fixtures are not a live publisher or isolation qualification. A real release must reconcile its exact archive with qualified device evidence before tagging |
| C16 | `cli-help.test.ts`, `cli-narrative.test.ts`, workflow/provider command tests and installed public-command proof | Major-version command contracts are explicit; legacy launcher retirement is part of deferred installed cutover, not a compatibility wrapper |
| C17 | Decision/configuration/context tests and the E3 evaluation disposition; memory-port tests bind scope, staleness and withdrawal | JEV is optional with provider-free fallback; observed development benefit remains inconclusive. Mnemos adoption stays deferred |
| C18 | Simulator/resource/workflow cleanup tests plus actual simulator and wired-device scenarios, wired cancellation, and matched orphaned-Metro replacement comparison | Candidate recovered where baseline failed in one matched case; no general speed/token/reliability-rate claim. Physical removal/reconnect remains deferred |

The external-capability seam is deliberately a contract probe. Availability and policy-grant checks
reject unsupported or unapproved operations; a fresh process reconstructs unresolved observations
from retained JSON. It neither grants external dispatch nor supplies remote durable custody. The CI
producer verifier and observed candidate inputs must come from a trusted controller, not the candidate.
