---
id: proposed.kmp-skill-library.quality-provenance
title: KMP Skill Quality and Provenance Contract
type: specification
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Candidate-to-active lifecycle, source, freshness, selection-scenario, conditional consumer-proof, and provider-conformance contract for KMP skills.
---

# KMP Skill Quality and Provenance Contract

This is Planning Packet 3 for the provider-neutral KMP skill library. It defines the evidence needed
before one router or leaf becomes active. It does not implement a manifest schema, evaluation
runner, consumer fixture, or skill.

## Core rule

Packaging is not approval. Length is not richness. Correct prose is not proof of useful behavior.

A KMP skill becomes active only when its exact content, sources, target scope, freshness, behavior
evaluations, selection scenarios, applicable consumer proof, and provider-conformance evidence are
reviewed together.

## Lifecycle

| State | Meaning | Activation |
| --- | --- | --- |
| `candidate` | Content is under development or audit and may be evaluated. | Never implicit; explicit evaluation only. |
| `active` | All required gates pass for the recorded content digest and applicability. | Default or profile-gated as declared. |
| `deprecated` | A replacement exists or the capability is no longer recommended. | No new implicit activation; migration-only access. |
| `retired` | Content is removed from the active distribution surface; history remains in Git. | None. |

`included` may describe packaging, but it is not a lifecycle or quality state.

Lifecycle is recorded in the reviewed promotion record, not as a shipped V0 manifest field. V0
implements only the matching boundary it needs: manifest `activation.mode` is either
`evaluation-only` or `governed`. It does not implement the full lifecycle table as a runtime state
machine.

### Promotion

Candidate-to-active promotion requires:

- approved capability ownership and non-overlap decision;
- portable metadata and governed applicability;
- recorded source and authorization posture;
- current normative claims and freshness policy;
- behavior, selection-scenario, applicable consumer, and provider-conformance evidence;
- reviewed content and evidence digests; and
- no unresolved blocking defect or target-scope ambiguity.

### Demotion

An active skill returns to candidate or deprecated when:

- a normative source changes materially;
- declared compatibility or target support changes;
- an evaluation reveals incorrect activation, advice, or restraint;
- an upstream refresh changes semantics without local review;
- a replacement capability becomes authoritative; or
- its sources, authorization, digest, or required consumer evidence can no longer be verified.

## Capability ownership

Every entry has exactly one `capability_owner` ID. Two active leaves may not own the same decision.

Overlap review classifies adjacent content as:

- `compose`: generic process plus a KMP overlay;
- `reference`: one leaf links to detailed supporting material;
- `target-overlay`: shared core plus platform-family mechanics;
- `host-extension`: optional consumer ecosystem over the KMP contract;
- `supersede`: new entry replaces an old owner; or
- `reject`: no distinct value remains.

## Proposed manifest record

```yaml
- id: kmp-source-sets-and-platform-boundaries
  path: .governance/runtime/skills/stack-packs/kmp/core/kmp-source-sets-and-platform-boundaries/SKILL.md
  capability_owner: kmp.source-set-platform-boundaries
  activation:
    mode: evaluation-only
    default_level: recommended
  applicability:
    scope_level: shared-core
    target_families: [android, apple, jvm, web-js, web-wasm, wasi, native]
    device_profiles: [handheld, wearable-standalone, wearable-companion, wearable-hybrid]
    artifact_profiles: [application, shared-library, cross-language-sdk, server-service, tooling-cli]
    ui_postures: [none, native-host, shared-compose, hybrid]
  conflicts_with: []
  supersedes: [kotlin-platform-kmp-bridges]
  references:
    - path: .governance/runtime/skills/stack-packs/kmp/core/kmp-source-sets-and-platform-boundaries/references/source-record.yaml
      role: provenance
  freshness:
    reviewed_on: 2026-08-24
    triggers: [kotlin-release, hierarchy-change, target-support-change, failed-eval]
  evaluation_ids: [source-set-selection, source-set-restraint, source-set-value]
  selection_scenarios: [shared-contract-library, mobile-native-ui, shared-compose-app, swift-sdk-consumer, wearable-runtime-pair]
```

This example is non-executable. The active content digest is computed from packaged bytes rather
than maintained as a second mutable manifest value. Final field names require a separately
reviewed schema change. Every shipped reference uses its full canonical
`.governance/runtime/skills/...` path so the wheel boundary can assign it exactly one manifest
owner.

## Source classes

### Licensed import

Use when compatible licensing permits redistribution/modification and the upstream expression is
worth preserving.

Record:

- canonical owner, repository, path, license, and required notice;
- exact upstream commit and original file digest;
- import date and local content digest;
- whether bytes are preserved or locally modified; and
- every semantic local change.

### Independent adaptation

Use when a licensed source supplies useful capability ideas but its structure, scope, or
architecture does not fit the local owner.

Record the source as influence, verify normative claims independently, and author a new capability
contract and wording. Do not call an adaptation a byte-preserved import.

### Operator-authorized supplied import

Use for the operator-supplied Philipp Lackner skill corpus. The operator has explicitly authorized
adoption as-is when useful, so absence of a license grant is not an intake or promotion blocker for
this corpus.

Record the supplied file digest, observed author/source, intake date, byte-preserved versus modified
state, technical review, overlap decision, local changes, freshness, and evaluations. Authorization
removes the licensing gate; it does not waive correctness, target scope, provider neutrality,
conflict, restraint, freshness, or behavior-evaluation gates.

### Original synthesis

Use when no compatible skill exists or the capability requires a neutral synthesis across primary
sources and fixtures.

Record the claims matrix, primary sources, research questions, author/reviewer decisions, and
fixture evidence.

### Research-only input

Use for courses, videos, transcripts, or external repositories that are not operator-supplied skill
artifacts and have no separate import authorization. Store public metadata, questions, and original
evaluation scenarios only. Do not copy or closely paraphrase expression into the distributable
skill.

Research-only input is never listed as the license/provenance basis for shipped content.

## Source record

Every active entry needs a machine-checkable source record containing:

- source class;
- canonical owner and URL;
- access/review date;
- license identifier and preserved license/notice paths where applicable;
- operator authorization record where licensing is not the gate;
- upstream revision and imported digest where applicable;
- local content digest;
- normative primary sources;
- research-only inputs kept outside shipped content;
- semantic changes from upstream or previous local version; and
- reviewer and decision state.

No license may be inferred from public availability, repository hosting, or download access. The
Lackner exception is an explicit operator authorization, not an inferred license.

## Claim and freshness record

Normative and version-sensitive claims must be separable from general workflow guidance.

```yaml
- id: kmp.navigation3.supported-platforms
  kind: version-sensitive
  claim: Navigation 3 is available for the declared Compose Multiplatform target set.
  source: https://kotlinlang.org/docs/multiplatform/compose-navigation-3.html
  applies_to: [android, apple, jvm, web-wasm]
  reviewed_on: 2026-08-24
  refresh_triggers: [compose-release, navigation-release, failed-fixture]
```

The skill should tell an agent to inspect target-pinned versions; the claim record explains why the
generic guidance was considered current when activated.

### Freshness triggers

Refresh review occurs when any of these apply:

- Kotlin, Compose Multiplatform, Gradle, AGP, Xcode, Node, or a named library releases a materially
  relevant version;
- an official support/stability designation changes;
- an API becomes deprecated, stable, unsupported, or differently packaged;
- a fixture no longer builds or a behavior evaluation regresses;
- a security or supply-chain advisory affects the capability;
- the upstream source changes; or
- the scheduled `review_by` date arrives.

Time alone does not prove staleness, and a recent date does not prove correctness.

## Semantic refresh contract

An upstream refresh is classified before bytes change:

| Change class | Example | Required action |
| --- | --- | --- |
| Discovery | Name or description changes | Re-run activation and restraint evaluations. |
| Normative | Recommended pattern or safety rule changes | Technical review plus all correctness/conflict fixtures. |
| Compatibility | Versions, targets, artifacts, or stability change | Update claims/freshness and affected target fixtures. |
| Example | Code or scenario changes without normative intent | Verify authorization, correctness, and whether local examples remain preferable. |
| Structure | Sections/resources move | Re-run link, progressive-disclosure, and provider discovery checks. |
| Authorization/provenance | License, owner, notice, or operator authorization changes | Stop promotion or distribution until the applicable authorization path is resolved. |

Bulk overwrite is not an allowed refresh method for an active locally governed skill.

## Behavior evaluation contract

Each evaluation records:

- stable evaluation ID and capability owner;
- task prompt and fixture digest;
- activation mode and expected selected skills;
- material decisions expected from the skill;
- forbidden or unsafe outcomes;
- required observable evidence;
- allowed project-specific variation;
- scoring rubric and blocking criteria; and
- provider, model/config, skill, and output digests in ignored raw run evidence.

The committed promotion record retains the evaluation IDs, selected content digests, rubric
outcome, reviewer, date, and accepted residual risks. Raw model output and consumer runtime evidence
remain outside this checkout.

### Required evaluation classes

| Class | Required result |
| --- | --- |
| No-skill baseline | Demonstrates a repeatable material weakness or uncertainty worth addressing. |
| Forced activation | Produces technically correct decisions and required evidence when explicitly selected. |
| Automatic activation | Selects for matching tasks from portable discovery metadata, governed applicability, task signals, and target facts without requiring explicit user invocation. |
| Restraint | Stays inactive for generic Kotlin, excluded-target, and adjacent-capability tasks. |
| Conflict | Defers to target authority and composes with generic or more specific owners. |
| Provider conformance | Codex and Claude consume identical canonical bytes and satisfy the same decision rubric. |
| Selection scenario | Deterministic task, path, and declared-fact vectors select or reject the expected composition. |
| Consumer integration | When a leaf makes executable toolchain or API claims, the recommended path compiles/tests or is rejected correctly in separately maintained consumer proof. This is post-V0 unless a V0 entry makes such a claim. |
| Bridge pressure | When applicable, dense traffic preserves semantics, bounds retained work, exposes loss, rejects stale generations, keeps diagnostics truly default-off, and avoids unrelated consumer wake-ups. |
| Activation closure | Deterministic routing selects the skill when applicable, avoids it when excluded, and materializes the expected canonical bytes. |

### Value test

A skill demonstrates value only when, compared with the no-skill baseline, it improves at least one
material decision or evidence outcome without introducing a new blocking error, false universal
claim, unnecessary activation, or unsupported target assumption.

Evaluations score decisions and evidence, not prose similarity, response length, or adherence to one
model's phrasing.

## Consumer-fixture receipt

Each fixture run binds:

- fixture ID, revision, and digest;
- declared target/artifact/sharing/consumer contract;
- skill ID, version, and content digest;
- source and freshness record revisions;
- toolchain and dependency versions resolved by the fixture;
- commands selected from the fixture, not embedded in the skill;
- output artifact and test evidence; and
- result, limitations, and residual risk.

For a bridge-pressure claim, the receipt also records the relevant lane counts, payload-size class,
broad versus narrow notifications, queue/drop and stale-generation evidence, lifecycle result, and
target-appropriate performance observation. Synthetic policy proof must not be presented as device
or consumer runtime proof.

Consumer fixtures remain independent. They are not shipped in the wheel and are not confused with
the lightweight selection scenarios stored under `tests/`. A skill may not pass an executable
claim merely by recognizing conventions from the repository that authored it.

## Provider-conformance contract

Provider neutrality requires:

1. one canonical directory and content digest;
2. portable `name` and `description` frontmatter;
3. no provider tool syntax, user-home path, or provider policy in the canonical body;
4. one coordinator path that exposes the same immutable content;
5. discovery checks that record selected name, description, path, and digest; and
6. decision/evidence rubric equivalence rather than identical wording.

Provider or model identity belongs in evaluation receipts. It does not belong in the capability's
technical authority.

The detailed proactive selection and usage evidence is defined in the
[activation and utilization contract](activation-and-utilization.md). Provider-native discovery is
helpful but uncontrolled by V0; it is not evidence that a selected skill influenced the task.

## Review roles

Promotion requires two concerns to be reviewed, whether by separate people or separately recorded
review passes:

- technical review: KMP correctness, target applicability, alternatives, failure modes, fixtures,
  and version-sensitive claims; and
- governance review: capability ownership, overlap, source/authorization, digests, lifecycle, routing,
  restraint, and provider neutrality.

High-risk security, native-memory, artifact-signing, or compatibility claims may require an
additional domain reviewer under target policy.

## V0 release gate

The V0 router and six leaves activate only when:

- all seven entries have approved ownership and portable metadata;
- every selected content byte set and source record is digest-bound;
- all blocking behavior classes pass;
- deterministic selection materializes the expected exact bytes for all required and recommended
  V0 entries;
- every bridge-relevant entry passes its bridge-pressure cases from the
  [platform-bridge performance packet](bridge-performance-patterns.md);
- required cases pass across the four general selection scenarios and conditional wearable
  scenario;
- no active legacy entry remains an ambiguous owner;
- the coordinator exposes identical canonical content to both provider lanes; and
- the final V0 catalog and evidence packet are reviewed as one snapshot.

One passing leaf does not authorize partial default activation if the router or ownership map is
still ambiguous. Candidate evaluation may proceed one leaf at a time.

## Packet 3 exit gate

Packet 3 is ready for approval when reviewers accept:

- lifecycle and promotion/demotion rules;
- capability ownership and overlap dispositions;
- source classes, source records, and claim/freshness records;
- semantic refresh handling;
- behavior evaluation, selection-scenario records, and any applicable consumer-fixture receipts;
- provider-conformance rules;
- activation and materialization rules plus the explicit post-V0 utilization boundary; and
- the V0 activation gate.

After approval, Packet 4 can define the normalized V0 catalog and implementation slices without
changing these quality rules leaf by leaf.
