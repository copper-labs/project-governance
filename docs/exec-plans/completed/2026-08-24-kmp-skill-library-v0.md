---
id: exec-plan.kmp-skill-library-v0
title: KMP Skill Library V0 Implementation Plan
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Replace the unproved KMP collection with one stable router and six provider-neutral leaves whose automatic selection and exact materialization are proven before expansion.
---

# KMP Skill Library V0 Implementation Plan

## Final State

The wheel contains one active KMP router and six active shared-core leaves. An adopting repository
enables the existing `kmp-implementation` router once on the applicable target-owned route and
records optional KMP project-shape facts. From then on, the runtime selects the smallest applicable
leaf set from task intent, changed paths, and those facts; users do not need to name individual
skills.

The context result contains stable selection reasons, exclusions, canonical paths, and computed
content digests. Exact selected skill bytes are materialized in the bounded context packet used by
Codex or Claude. Selection behavior is proven by deterministic scenarios and decision-oriented
model evaluations. No provider-specific copy is canonical.

The existing 24 leaves are frozen as source material, then removed from the shipping payload after
their distinct V0 guidance is retained or explicitly rejected. Rollback is repinning the prior
wheel. The first separately approved expansion is one wearable architecture overlay.

## Non-Goals

- Building the full KMP capability map in V0.
- Parsing Gradle models or arbitrary project source to infer target facts.
- Adding a KMP-specific kernel module or a general policy engine.
- Adding a knowledge graph, embeddings, semantic search, learned routing, or mutable routing state.
- Adding live model calls to ordinary CI.
- Adding a utilization CLI, receipt database, or telemetry path in V0.
- Building or maintaining compiling Android, Apple, web, or wearable consumer applications inside
  this repository for V0.
- Renaming `kmp-implementation`, adding aliases, or retaining compatibility wrappers.
- Shipping inactive candidate skills, raw evaluation runs, or provider-specific skill variants.
- Importing every operator-supplied Lackner file merely because direct adoption is authorized.

## Fixed Decisions

1. Markdown skill files and packaged manifests remain the only runtime content authority.
2. The runtime matcher is stack-neutral. KMP vocabulary and applicability live in the KMP manifest
   and are opaque values to the matcher.
3. The target-owned route remains activation authority. Automatic leaf composition occurs only
   when a `matched` route names `kmp-implementation` in that route's own `skills` list.
   `default_skills`, fallback, and ambiguous outcomes never trigger pack composition.
4. Optional project-shape input lives under the existing open `facts` mapping as
   `facts.skill_context`. This is an additive Version 1 contract, not a configuration-schema bump.
5. Absence of `facts.skill_context` alone preserves existing router-only selection and adds no leaf
   bytes. A separately detected stale materialized skill tree may still block; after any wheel
   update, bootstrap re-materialization is a required precondition before context resolution.
6. The selected-skill byte limit is
   `min(16_000, total_context_tokens * TOKEN_BYTES // 2)`. With the current 10,000-token default and
   four-byte conversion, context remains capped at 40,000 bytes, skills at 16,000 bytes, and the
   reported combined maximum is 56,000 bytes. The skill limit is enforced separately so selected
   skills neither starve declared context nor grow without target control.
7. Packaged bytes are canonical for manifest `skills[]` entries and any top-level `router_skill`
   named by an active pack manifest. Resolve them through
   `importlib.resources.files("project_governance_runtime")`, which points at the installed wheel in
   adopters and the source package during source development. Digests are computed; no live digest
   is hand-maintained. A materialized manifest-owned entry that differs blocks with
   `skill-stale-materialization`. Unrelated top-level skills and target test doubles not owned by a
   pack manifest retain current behavior.
8. Packet identity includes ordered context and selected-skill paths plus content digests. Selection
   reasons are returned metadata but do not create duplicate byte-identical packet directories.
9. V0 evaluation scenarios prove selection, composition, restraint, and decision value. They are
   not represented as compiling consumer proof.
10. Detailed wearable mechanics remain post-V0, but wearable topology and authority facts affect
    the relevant V0 core decisions from the start.
11. The supplied Lackner files can be preserved or modified without a licensing gate. Technical
    correctness, distinct value, target scope, freshness, neutrality, and evaluation value decide
    whether any later overlay is admitted.
12. No wheel publication, adopter update, or telemetry collection is authorized by this plan.
13. One bounded `activation.mode` field is retained: `evaluation-only` is selectable only by the
    evaluation harness, while `governed` permits ordinary automatic selection. This is not a
    general lifecycle engine.
14. After cutover, `stack-packs/kmp/manifest.yaml` is the only KMP pack manifest. The advanced-bridge
    catalog entry, manifest, and superseded payload are removed after distinct V0 guidance is
    retained.
15. Direct route declaration cannot bypass promotion: an ordinary route that names an
    `evaluation-only` nested leaf blocks with `skill-evaluation-only`. Only the explicit evaluation
    harness may opt into that mode, and a releasable wheel contains zero evaluation-only entries.
16. Final V0 leaves live under `stack-packs/kmp/core/<skill-id>/`. Shipped references use full
    `.governance/runtime/skills/...` paths in the manifest; pack-relative reference paths are
    invalid.

## Minimal Architecture

```text
matched target route lists kmp-implementation in routes[].skills
  -> generic manifest index resolves the KMP pack
  -> generic exact-match applicability checks task/path/optional facts
  -> selected IDs resolve to packaged canonical bytes
  -> installed bytes are verified and materialized in the context packet
  -> coordinator reads the packet and reports affected decisions in the normal handoff
```

Likely implementation ownership:

- `src/project_governance_runtime/skill_catalog.py` owns generic catalog/manifest traversal, path
  safety, exact-match applicability, and canonical-byte lookup. Keep the helper private in
  `context.py` instead if it does not form a cohesive independent owner.
- `src/project_governance_runtime/context.py` retains route scoring, calls the generic resolver only
  for the route-selected stack router, applies the separate skill-byte cap, and materializes the
  selected bytes.
- `src/project_governance_runtime/checker_scripts/check-context-router.py` loads an optional facts
  file for facts-only validation even without a router. Its helper in `context_check_profile.py`
  validates `facts.skill_context` independently; the existing router path still requires the facts
  file as it does today.
- The KMP manifest owns capability IDs, exact applicability values, activation level, conflicts,
  references, freshness, and the stable router relationship.
- `tests/` owns selection scenarios and rubrics. The wheel ships skill references needed during
  work, never evaluation cases or raw provider runs.

The applicability matcher supports only:

- exact list overlap against declared fact fields;
- explicit required and excluded fact values;
- existing task-term matching;
- existing changed-path glob matching;
- the `evaluation-only` versus `governed` activation-mode gate; and
- stable declaration-order tie breaking.

It does not support arbitrary expressions, nested boolean trees, executable callbacks, or
pack-specific Python.

## Approval Transition

The original proposal was retired after implementation. Git history preserves it. At that point,
move it to `docs/exec-plans/active/`, set `status: active`, and link it from
`docs/exec-plans/README.md`. Do not treat the existence of this draft as implementation authority.

## Execution Rules

- Preserve the current dirty documentation work and freeze the current skill bytes before editing
  runtime assets.
- Implement one slice at a time. Run its focused owner tests and one directly affected seam.
- Keep new V0 entries `activation.mode: evaluation-only` on the unreleased source branch until the
  cutover slice. Only the evaluation harness may include that mode.
- Do not place operator-supplied candidate bytes under packaged `assets/skills` until one is
  separately approved for activation.
- Do not commit raw model output, adopter paths, product evidence, or consumer runtime receipts.
- A live provider evaluation can inform promotion but cannot become a deterministic CI gate.
- Stop if the implementation requires a schema bump, provider client, new service, second content
  registry, or adopter mutation not authorized here.

## Slice S0: Freeze the Baseline and Selection Scenarios

- Depends on: approved plan transition
- Ownership: dated legacy snapshot, scenario inputs, rubrics, transition map
- Execution: sequential
- Semantic contract: settled
- Required capability: balanced
- Work:
  - record a dated, immutable ID/path/SHA256 snapshot for the existing router and 24 leaves;
  - record the eight supplied Lackner file digests and dispositions without copying candidate bytes
    into the package;
  - define four general selection scenarios plus the conditional wearable scenario as task,
    changed-path, and declared-fact vectors;
  - define no-skill, forced, automatic, restraint, conflict, missing-fact, and decision-value
    expectations;
  - map every legacy leaf to retain-in-V0, defer, or reject.
- Acceptance:
  - every old leaf and supplied file has one stable snapshot identity;
  - every V0 capability has positive and restraint coverage;
  - the wearable scenario distinguishes authority, topology, disconnect/reconnect, and target proof;
  - the snapshot is explicitly historical and is never refreshed as a live digest registry.
- Focused proof:
  - one fixture-loader test rejects duplicate IDs, invalid references, and incomplete rubrics;
  - documentation governance and `git diff --check`.
- Invalidates prior proof when: a scenario, rubric, transition disposition, or snapshot byte changes.
- Stop when: a scenario requires private adopter data or claims to provide consumer build proof.
- Packet ready: yes

## Slice S1: Resolve Nested Skills and Validate Optional Facts

- Depends on: S0
- Ownership: generic skill index, KMP manifest metadata, optional fact validation, wheel boundary
- Execution: sequential
- Semantic contract: settled
- Required capability: primary
- Work:
  - index top-level and manifest-declared nested skills from the packaged catalog without a
    filesystem-wide scan;
  - resolve every ID to one safe canonical path and packaged byte set;
  - reject duplicate skill IDs, escaping paths, missing files, mismatched portable names, and
    multiple active capability owners. A catalog skill plus one or more manifests that reference
    the same canonical `router_skill` is one skill owner with pack attachments, not duplication;
  - add the minimal manifest applicability fields used by the generic matcher;
  - convert the stable top-level KMP router and six V0 leaves to portable `name` and `description`
    frontmatter; document the router as the deliberate KMP-only exception while leaving unrelated
    top-level generic skills unchanged;
  - validate optional `facts.skill_context` lists independently of router presence by adding an
    unconditional facts-validation branch in `check-context-router.py`; load the facts file with
    `required=False` on that branch so unconfigured repositories without it still pass;
  - support only `evaluation-only` and `governed` activation modes in the generic matcher and block
    ordinary direct declaration of an evaluation-only nested ID;
  - place all new entries below `stack-packs/kmp/core/<skill-id>/`;
  - extend the wheel-boundary declaration logic for manifest-owned `references/` using full runtime
    paths, but not `evals/` or inactive candidate content.
- Optional fact fields:
  - ecosystems;
  - target families and runtime profiles;
  - project support tiers;
  - artifact profiles and consumers;
  - UI posture;
  - device/wearable topology; and
  - boundary-pressure classes.
- Acceptance:
  - every existing nested KMP leaf resolves by ID;
  - `kmp-implementation` remains the stable router ID;
  - malformed optional facts fail with one actionable finding whether or not a router is configured;
  - absent optional facts and non-KMP routes produce byte-identical selection results to the
    pre-change baseline when installed skill materialization is current;
  - packaged references have one manifest owner and evaluation files do not enter the wheel.
- Focused proof:
  - catalog/index and checker unit tests;
  - package-materialization seam proving source and installed layouts resolve identically;
  - explicit no-facts/non-KMP regression.
- Invalidates prior proof when: catalog traversal, manifest fields, fact validation, frontmatter,
  path safety, or package declaration changes.
- Stop when: a requested selector rule needs nested expressions, pack-specific code, or a
  configuration-schema bump.
- Packet ready: yes after the minimal fields are frozen.

## Slice S2: Select and Materialize the Smallest KMP Packet

- Depends on: S1
- Ownership: route-to-pack attachment, generic applicability matching, context result and
  materialization
- Execution: sequential
- Semantic contract: settled
- Required capability: primary
- Work:
  - invoke leaf composition only for a `matched` route whose route-local `skills` list names
    `kmp-implementation`; never compose from `default_skills`, fallback, or ambiguous outcomes;
  - exact-match the KMP manifest against task terms, changed paths, and optional skill-context facts;
  - select the router plus the smallest required/recommended leaf set and preserve exclusions and
    unresolved facts;
  - verify the installed copy against packaged canonical bytes;
  - derive the skill limit as
    `min(16_000, total_context_tokens * TOKEN_BYTES // 2)`, enforce it separately, and report skill
    bytes, skill limit, and the computed
    `total_context_tokens * TOKEN_BYTES + skill_limit` maximum beside existing limits; the default
    value is 56,000 bytes;
  - materialize exact selected bytes beside current context items;
  - derive packet identity from ordered selected paths and digests, not diagnostic reasons.
- Acceptance:
  - positive scenarios select the expected minimal composition;
  - generic Kotlin, Android-only, host-only, excluded-target, and non-wearable cases demonstrate
    restraint;
  - missing explicit facts never become an inferred Android phone profile;
  - stale, missing, unsafe, required-over-budget, conflict, and ambiguous cases are explicit;
  - repeated resolution is deterministic;
  - `evaluation-only` entries are absent from ordinary selection and available to the explicit
    evaluation harness;
  - direct route declaration of an evaluation-only nested ID blocks explicitly;
  - Codex and Claude coordinator lanes receive the same bytes by construction.
- Focused proof:
  - extend context tests for nested IDs, selection reasons, exclusions, cap behavior, stale
    materialization, exact bytes, and packet identity;
  - context-checker seam for invalid facts and references;
  - non-KMP/no-facts regression.
- Invalidates prior proof when: route precedence, matching, cap, canonical-byte comparison,
  materialization, or packet identity changes.
- Stop when: implementation would attach a stack the target route did not enable or require a
  provider-specific copy.
- Packet ready: yes

## Slice S3: Replace the Router and Normalize Six Leaves

- Depends on: S2
- Ownership: stable KMP router, six shared-core leaves, references, sources, and leaf scenarios
- Execution: sequential, one entry at a time
- Semantic contract: settled
- Required capability: primary
- Delivery order:
  1. replace `kmp-implementation` content with the project-shape router;
  2. `kmp-sharing-and-architecture`;
  3. `kmp-source-sets-and-platform-boundaries`;
  4. `kmp-build-and-compatibility`;
  5. `kmp-coroutines-and-concurrency`;
  6. `kmp-api-and-artifact-boundaries`;
  7. `kmp-test-and-evidence`.
- Per-entry work:
  - retain only distinct KMP decisions from the frozen legacy material;
  - verify normative claims against dated primary sources;
  - add applicability, exclusions, alternatives, failure modes, stopping conditions, bridge/wearable
    implications, and observable evidence;
  - keep detailed explanation in manifest-owned references so selected `SKILL.md` files remain
    bounded;
  - run static contract, automatic-selection, restraint, and decision-value cases before beginning
    the next entry.
- Lackner boundary:
  - complete accept/adapt/defer/reject decisions during overlap review;
  - do not activate Koin, Android presentation, navigation, testing, Compose, or other target
    overlays in V0 even when their later disposition is favorable;
  - directly preserve a supplied file only when a later target-overlay gate proves it is the
    smallest correct owner.
- Acceptance:
  - all seven entries satisfy the rich-enough gate and portable frontmatter contract;
  - no entry copies generic change workflow or makes Android phone assumptions universal;
  - bridge pressure and wearable facts alter the relevant decisions without adding more V0 leaves;
  - the router derives its leaf set from the manifest and contains no second list;
  - every new entry remains `evaluation-only` throughout S3;
  - no selection scenario shows a blocking regression from the frozen baseline.
- Focused proof:
  - one entry's static and scenario tests at a time;
  - primary-source and freshness validation for that entry;
  - one S2 integration case after each selection-metadata change.
- Invalidates prior proof when: instructions, references, applicability, exclusions, normative claims,
  or sources change.
- Stop when: an entry cannot change one material decision over the no-skill baseline or requires a
  deferred capability.
- Packet ready: yes per entry after sources and scenarios are frozen.

## Slice S4: Prove and Cut Over the V0 Payload

- Depends on: S3
- Ownership: evaluation summary, active KMP manifest, packaged payload, transition record
- Execution: sequential on one frozen candidate
- Semantic contract: settled
- Required capability: primary
- Work:
  - run deterministic selection/materialization tests in CI;
  - compare no-skill, forced, and automatic packets with Codex and Claude in an explicitly
    authorized manual evaluation lane;
  - score decisions, unsupported assumptions, restraint, target evidence, and blocking errors;
  - commit only the promotion decision, scenario/rubric outcome, selected content digests, reviewer,
    date, and residual risks; retain raw runs outside the checkout;
  - remove the superseded 24-leaf payload after its transition map is complete;
  - remove `kmp-advanced-bridge-pack` from the catalog and delete its manifest after retaining its
    distinct V0 guidance;
  - keep `stack-packs/kmp/manifest.yaml` as the sole KMP manifest and switch exactly its seven V0
    entries from `evaluation-only` to `governed`;
  - rewrite that manifest as `normalized-mixed-provenance`, keep the Apache-2.0 `LICENSE`, and
    update `NOTICE.md` to identify retained adapted upstream material and local modifications; each
    entry's source record distinguishes imported/adapted, operator-authorized, and original content.
- Acceptance:
  - automatic selection ties or beats forced selection and beats the no-skill baseline on at least
    one material decision per leaf;
  - one blocking regression prevents promotion regardless of average score;
  - both coordinator lanes receive identical bytes and canonical bodies contain no provider syntax
    or user-home paths;
  - the release manifest contains zero `activation.mode: evaluation-only` entries;
  - exactly one active owner exists for every V0 capability;
  - clean wheel installation resolves all seven entries from one KMP manifest and no superseded,
    advanced-pack, or unmanifested KMP skill remains in the payload;
  - selection and materialization are proven; compiling consumer integration remains a named
    residual risk until a separately authorized adopter or independent fixture supplies it.
- Focused proof:
  - catalog, context, checker, skill-payload, and package-installation tests;
  - wheel-boundary inspection;
  - one frozen-candidate model evaluation summary;
  - one branch-aware impacted pre-push sign-off.
- Invalidates prior proof when: selected bytes, manifest ownership, matcher, scenario, rubric, or
  package payload changes.
- Stop when: forced invocation consistently outperforms automatic selection, any legacy behavior is
  unmapped, or the candidate needs an alias or second runtime authority.
- Packet ready: no until every S3 entry is frozen.

## Slice S5: Add One Wearable Architecture Overlay

- Depends on: stable S4 cutover and separate operator approval
- Ownership: `kmp-wearable-architecture`, official platform references, wearable scenarios
- Execution: sequential
- Semantic contract: settled at topology and authority level; platform mechanics refreshed during
  authoring
- Required capability: primary
- Work:
  - add one profile-gated overlay for Wear OS and watchOS architecture;
  - cover standalone, companion, hybrid, sensor-peripheral, and replicated-peer topology;
  - separate progression/execution, acquisition, and workout/record authority;
  - cover local durability, reconnect/retry/dedup/conflict, freshness/liveness/validity/provenance,
    background and power constraints, permissions, health data, signing, and affected-target proof;
  - keep vendor SDKs, UI toolkits, stores, and provider-specific sensor mechanics in references or
    later narrow overlays.
- Acceptance:
  - wearable scenarios activate the overlay automatically from declared facts;
  - ordinary handheld KMP work demonstrates restraint;
  - no shared-logic claim implies shared wearable UI;
  - Wear OS and watchOS evidence obligations remain distinct;
  - both coordinator lanes receive identical selected bytes.
- Focused proof:
  - wearable positive, missing-fact, disconnect, stale-measurement, constrained-background, and
    restraint scenarios;
  - current official platform-source review;
  - manual cross-provider decision comparison.
- Invalidates prior proof when: topology, authority, platform claims, scenarios, or selected bytes
  change.
- Stop when: correct guidance requires a vendor- or platform-specific capability owner; propose a
  later narrow overlay instead.
- Packet ready: no until separately approved.

## Later Expansion Rule

There is no standing S6 backlog. Admit one later capability only when evidence names a missing
decision that the V0 composition cannot cover. A focused plan revision must name one owner, source
path, positive and restraint scenarios, and cutover proof. Capability priority does not imply
admission order, and catalog completeness is never a reason to add a leaf.

## Stable-Candidate Proof

After S4 freezes the candidate, run once:

1. focused catalog, fact-validation, matcher, context, and selection-scenario tests;
2. skill-payload and package-installation seam tests;
3. built-wheel boundary inspection and clean temporary installation;
4. documentation governance and link checks;
5. one no-skill/forced/automatic manual evaluation on the frozen packets; and
6. one branch-aware impacted pre-push sign-off.

QA consumes this evidence. A later change reruns only proof whose named subject changed.

## Risks and Pause Criteria

| Risk | Containment | Pause condition |
| --- | --- | --- |
| Generic matching grows into a rule engine | Exact lists, terms, globs, and fixed precedence only | A capability needs expressions or executable policy |
| Skill content crowds out or unbounds project context | `min(16_000, total_context_tokens * TOKEN_BYTES // 2)`, a reported 56,000-byte default combined maximum, and progressive references | A normal V0 composition exceeds the derived limit |
| Automatic selection overrides target authority | Compose only from a matched route's local `skills` entry | Default, fallback, ambiguous, or undeclared routing attaches a stack |
| Optional facts become a breaking migration | Additive opt-in block; absent facts preserve selection behavior when the installed skill tree is current | A schema bump or adopter rewrite becomes necessary |
| Evaluation rewards style | Score decisions, errors, restraint, and evidence | Reviewers cannot tie a score to a rubric item |
| Android content becomes universal | Explicit scopes and negative scenarios | Android mechanics appear in shared rules without qualification |
| Wearable breadth delays V0 | Facts in V0, mechanics in S5 | V0 requires vendor SDK, store, or UI-toolkit detail |
| Selection proof is mistaken for product proof | Name compiling consumer proof as residual | A release claim requires target build/device evidence |

## Rollback

- Before S4 cutover, restore the previous manifest routing while retaining failed candidate evidence.
- After cutover, repin an adopter to the prior wheel and SHA256.
- Do not create aliases, copy old package code into adopters, or maintain parallel active manifests.
- Git history and the transition record preserve superseded implementation.

## Independent Opus 5 Review Reconciliation

Claude Opus 5 reviewed the complete packet at high effort in read-only mode on 2026-08-24. The
wrapper audit confirmed model `claude-opus-5`, effort `high`, no fallback, no timeout, and no
repository changes. Two focused rechecks then tested the reconciled high/medium seams; their final
determinacy findings are included below. The closed-list recheck returned `GO` with no remaining or
new high/medium finding.

| Finding | Reconciliation |
| --- | --- |
| KMP-specific kernel module violated the neutral runtime boundary | Replaced it with one generic exact-match manifest resolver; KMP vocabulary stays in the pack. |
| Target-fact schema and migration were unowned | Added optional `facts.skill_context`, validation, absent-facts behavior, and an explicit no-schema-bump decision to S1. |
| Skill bytes could starve existing context budgets | Derived a separate limit from the route total, report the combined maximum, and require a no-facts/non-KMP regression. |
| A new router ID would break adopter routes | Retained `kmp-implementation` and replaced its content in place. |
| Lightweight scenarios and compiling consumer fixtures were conflated | Split them; V0 proves selection/decision behavior and names consumer compilation as residual proof. |
| Content authoring depended on selection machinery it claimed to precede | Made S3 depend on the completed S2 selection/materialization seam. |
| Utilization receipts were both mandatory and optional | Removed the runtime receipt and telemetry from V0; the normal handoff reports affected decisions. |
| Packaged references/evaluations/lifecycle conflicted with wheel boundaries | Ship manifest-owned references only; keep scenarios/rubrics in tests and raw runs outside the checkout. |
| Canonical-byte and stale-copy behavior were unclear | Verify manifest leaves and any named `router_skill` through `importlib.resources`; unrelated top-level test doubles remain unchanged. |
| Provider-native discovery could not be enforced | Limited conformance to the coordinator path plus portable-content checks. |
| Route-versus-pack precedence was ambiguous | Only a matched route's own `skills` list can opt into `kmp-implementation`; defaults, fallback, and ambiguity cannot compose leaves. |
| This checkout cannot prove real adopter activation | Synthetic scenarios prove V0 here; a future adopter must add optional facts and enable the router under separate authority. |
| Sequential authoring had no inactive selection state | Retained one bounded `activation.mode` predicate so evaluation-only entries are selectable only by the harness until cutover. |
| Two KMP manifests claimed the same router | S4 retains one core KMP manifest and removes the advanced pack entry, manifest, and superseded payload. |
| Fact validation depended on router presence | S1 validates `facts.skill_context` independently of router configuration. |
| Router frontmatter remained on the generic convention | S1 converts only the stable KMP router and six leaves to portable frontmatter and documents that narrow exception. |
| Skill-cap units and effective maximum were ambiguous | Defined `min(16_000, total_context_tokens * TOKEN_BYTES // 2)` and the 56,000-byte default combined maximum. |
| Evaluation-only leaves could be named directly or leak into a release | Direct ordinary selection blocks with `skill-evaluation-only`; S4 proves the release manifest contains zero evaluation-only entries. |
| Checker ownership could not validate facts without a router | Added the checker entrypoint, optional facts load, and independent helper to S1 ownership. |
| Final mixed provenance and reference paths were unresolved | Keep one mixed-provenance manifest, an updated Apache notice for adapted material, per-entry source classes, and full runtime reference paths under `core/`. |
| Absent facts and stale upgraded skill bytes were conflated | Absence alone preserves selection; an incomplete post-update bootstrap remains an explicit stale-materialization blocker. |
| Router attachments looked like duplicate skill owners | The catalog owns the router skill; manifest `router_skill` references attach packs and do not create another capability owner. |
| A route-derived combined maximum was described as constant | Report the computed total for every route and label 56,000 bytes as the default only. |
| Future overlays appeared in V0 routing examples | Rewrote examples to the seven-entry V0 surface and labeled wearable/other overlays as separately gated. |
| Governance lifecycle and runtime activation were conflated | Keep lifecycle in the reviewed promotion record; ship only the bounded activation mode. |

## Simplification Pass

The reconciliation was followed by a subtractive review. These elements were removed or deferred
without losing the goals:

| Removed or deferred | Why form and function remain intact |
| --- | --- |
| Dedicated `kmp_selection.py` | One generic manifest matcher preserves proactive selection without stack policy in Python. |
| General lifecycle/conflict engine | V0 keeps only one `evaluation-only`/`governed` activation bit plus exact-match exclusions, not a policy language. |
| Configuration-schema bump and migration | Optional facts fit the existing open facts mapping and preserve all absent-fact behavior. |
| Target-configurable skill-budget schema | A conservative limit derived from the existing route total provides target control without another setting. |
| Hand-maintained live content digests | Digests are derived from canonical packaged bytes; only the dated legacy snapshot is stored. |
| Runtime utilization CLI and receipt store | Exact materialization plus explicit handoff and outcome evaluations address use; add receipts only if observed friction justifies them. |
| Utilization telemetry | V0 has no evidence that remote usage metrics would change a decision. |
| Provider-specific skill copies or adapters | Both providers use one coordinator packet; native discovery stays supplemental. |
| Live provider calls in CI | Deterministic selection runs in CI; manual frozen-candidate evaluation covers model behavior. |
| Compiling multi-platform fixture fleet in this repo | V0 does not make product-runtime proof claims; later executable claims require separate consumer evidence. |
| New router ID, aliases, and deprecation window | Replacing `kmp-implementation` in place preserves adopters and one authority. |
| Shipping inactive Lackner and legacy candidates in a release | Authorized material remains research input until a capability passes admission; the governed V0 wheel contains no inactive candidate payload. |
| Standing implementation plan for every later family | A one-gap admission rule prevents roadmap ambition from becoming current delivery scope. |

The completed irreducible path resolved nested canonical skills, accepted an optional target-fact
block, selected the smallest KMP composition, materialized exact bytes, authored seven high-value
entries, proved decision value, and cut over once. Any wearable overlay still requires separate
approval.

## Authorization Boundaries

The operator authorized S0-S3 implementation, the frozen Codex/Claude evaluation, and then the S4
local payload cutover on 2026-08-24. Wheel publication, adopter updates, S5 wearable work, remote
telemetry, and later capability families remain separate decisions.

## Implementation Record

S0-S3 completed locally on 2026-08-24:

- `d7e864e` froze the historical router, 24 legacy leaves, eight supplied candidates, transition
  dispositions, and five behavior-first scenario vectors.
- `406c585` added catalog-and-manifest skill resolution, canonical path ownership, portable identity
  validation, and independent optional fact validation.
- `3df8c7b` added matched-route composition, evaluation gating, exact installed-byte verification,
  the separate skill budget, deterministic packet identity, and materialization.
- `1ff73b6` added the portable project-shape router and six progressively disclosed KMP leaves as
  `evaluation-only` candidates, including bridge-performance and wearable decision pressure.

Proof on the integrated S0-S3 snapshot:

- all seven skill directories passed the skill static validator;
- 34 focused catalog, context, checker, scenario, payload, and wheel-ownership tests passed;
- the complete 275-test runtime suite passed with one existing skip; and
- the two wheel reproducibility and payload-boundary tests passed.

The frozen cross-provider behavior comparison is recorded in the
[KMP Skill V0 Evaluation](../../reference/kmp-skill-v0-evaluation.md):

- all five scenarios passed no-skill, forced, and automatic comparison with Codex and Claude;
- automatic routing tied or beat forced guidance and improved at least one material decision or
  restraint over baseline for every V0 leaf;
- the final run used `gpt-5.6-sol` at high reasoning and `claude-opus-5` at high effort with no
  fallback; and
- sharing, compatibility, and concurrency received one narrow correction pass before the final
  candidate bytes were frozen.

S4 completed the authorized local cutover:

- `kmp-implementation` and all six V0 leaves now use `activation.mode: governed`;
- `stack-packs/kmp/manifest.yaml` is the sole KMP manifest and declares normalized mixed
  provenance;
- the catalog no longer declares `kmp-advanced-bridge-pack`;
- all 15 upstream leaves, 9 advanced leaves, and the advanced manifest were removed from the wheel
  after their transition dispositions and frozen digests were preserved;
- the Apache-2.0 license and updated notice remain in the governed payload; and
- current inventory documentation now distinguishes the live seven-entry core from the historical
  audit and frozen legacy fixture.

## Closeout

Validation on the integrated cutover snapshot:

- the router and six leaf directories passed the skill static validator;
- all 13 selected skill/reference SHA256 values matched the frozen evaluation record;
- 24 focused catalog, context, KMP selection, fixture, payload, and wheel-boundary tests passed;
- the complete 275-test runtime suite passed with one existing skip;
- the reproducible wheel boundary passed as part of the focused and full suites; and
- a newly built development wheel installed into a clean temporary environment, resolved exactly
  seven governed KMP entries from one manifest, materialized the same seven entries, and contained
  no `advanced-bridge` or `upstream` payload.

No wheel was published, no adopter repository was changed, and no S5 wearable overlay was created.
The residual risk is unchanged: model scenarios prove routing and decision value, while real
consumer builds and physical Wear OS/watchOS evidence remain required for adopter, artifact,
performance, background, power, or device-support claims.
