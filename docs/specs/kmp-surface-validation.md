---
id: spec.kmp-surface-validation
title: KMP Surface Validation
type: spec
status: current
owner: project-governance
created: 2026-08-30
updated: 2026-08-30
summary: Defines opt-in catalog-driven validation for cross-surface KMP routes and target-local proof.
---

# KMP Surface Validation

Kotlin Multiplatform can keep behavior in one shared owner while delivering it through independently
breakable consumer surfaces. Shared tests can prove common behavior without proving that every
binding, host, renderer, and user interaction still works. KMP Surface Validation gives an adopting
repository one small map from selected shared capabilities to every surface that must deliver them.

This specification is the canonical Version 1 contract. The runtime schema, validator, pack command,
doctor checks, and installed agent guidance implement it without enabling the feature for adopters.

## Objective

Provide a deterministic, read-only validator for an adopter-owned KMP surface graph. Adding a target
to the referenced catalog must immediately expose every cross-surface capability that does not yet
cover it.

The runtime owns the document contracts and structural validation. The adopting repository owns the
target catalog, covered capabilities, paths, claims, selectors, lifecycle policy, and proof.

## Scope

The graph covers the complete set of user-visible **cross-surface capabilities** selected by the
adopter. Each begins in or passes through shared KMP architecture and is expected on every target in
the referenced catalog.

The graph does not describe a complete product umbrella. Headless-only behavior remains with unit,
scenario, integration, and end-to-end testing. Functionality intentionally exclusive to one platform
remains with that platform's validation instead of creating an applicability exception here.

## Version 1 Decisions

- KMP Surface Validation is installed in the wheel but disabled by default.
- One active target-owned pack with ID `kmp-surface-validation` enables it and invokes the built-in
  validator.
- The graph has the conventional path `config/validation/kmp-surfaces.yaml`; the graph retains its
  explicit `target_catalog` reference.
- The graph references one adopter-owned target catalog and contains no second target inventory.
- Every catalog target has the same obligation within an area. There are no tiers, exclusions,
  target subsets, or `not-applicable` routes.
- A target is the smallest consumer surface that can break, ship, or be validated independently.
- `route` areas provide shallow structural coverage. `guarded` areas add composed roles and claims
  plus claims that every target must prove locally.
- Missing implementation and missing proof are distinct blocking gaps.
- The validator checks structure and references. It does not execute tests, builds, browsers,
  simulators, or devices and does not retain results.
- `pre-push`, `ci-pr`, and `release` are recommended stages. The adopter may choose any stages valid
  under the ordinary pack contract. Pre-commit is neither recommended nor generated.
- Direct promotion is recorded separately in the
  [KMP Surface Validation promotion decision](../decisions/2026-08-30-kmp-surface-validation-direct-promotion.md).

## Non-Goals

- Whole-repository test planning, changed-path analysis, or dependency impact.
- Discovering product features or graph files from source code.
- Deciding which capabilities or paths an adopter should cover.
- Running proof or treating a proof reference as a current passing result.
- Storing graph history, evidence, generated indexes, or visualizations.
- Replacing product specifications, target packs, CI workflows, or platform-owned validation.
- Mutating an adopting repository during installation or upgrade.

## Model

One area describes one cross-surface capability:

```text
shared KMP owner
  -> optional reusable projection
  -> target-local binding, host, or renderer
  -> target-local proof when guarded
```

A `route` area records enough structure to show that the shared capability reaches every target. A
`guarded` area adds proof for fragile seams such as customization, preview behavior, countdowns, and
lifecycle integration.

A projection records reusable adapter or renderer work shared by a subset of targets. React Native
iOS and React Native Android, for example, remain separate targets when their native hosts or proof
can fail independently even when both use one shared projection.

## Target Catalog

The graph's `target_catalog` field references one repository-relative JSON document:

```json
{
  "kind": "kmp-surface-target-catalog",
  "schema_version": 1,
  "targets": ["web", "bridge-ios", "bridge-android"]
}
```

`targets` is a non-empty list of unique, stable, lowercase IDs. Entries are strings and carry no
tier, applicability, enforcement, report path, or proof configuration. Unknown fields fail schema
validation. The catalog requires exact kind `kmp-surface-target-catalog` and exact
`schema_version: 1`; unknown versions are structurally invalid.

The catalog is the sole target authority for this graph. Graph routes and adopter tooling may refer
to its IDs, but the graph cannot declare or override the target list.

Use separate targets when any of these can differ independently:

- host binding or lifecycle;
- shipped artifact or application integration;
- renderer or platform API; or
- browser, simulator, device, or end-to-end proof.

Do not split targets only because compiler tasks or build aliases differ. If two outputs use the same
runtime path, artifact, renderer, and proof, one target is sufficient.

## Graph Document

The graph is the repository-owned YAML document at `config/validation/kmp-surfaces.yaml`:

```yaml
kind: kmp-surface-validation
schema_version: 1
target_catalog: config/validation/kmp-surface-targets.json

areas:
  - id: navigation-shell
    summary: Shared navigation reaches every consumer surface.
    validation: route
    contract:
      path: docs/specs/navigation.md
    shared_route:
      checkpoints:
        - role: shared-owner
          path: shared/src/commonMain/Navigation.kt
    target_routes:
      - target: web
        checkpoints:
          - role: renderer
            path: adapters/web/navigation.ts
      - target: bridge-ios
        checkpoints:
          - role: host
            path: apps/bridge/ios/NavigationHost.swift
      - target: bridge-android
        checkpoints:
          - role: host
            path: apps/bridge/android/NavigationHost.kt

  - id: timed-state
    summary: Prepared time state remains visible and current on every surface.
    validation: guarded
    contract:
      path: docs/specs/timed-state.md
    required_checkpoint_roles: [shared-owner, renderer]
    required_proof_claims: [behavior, visible]
    required_target_proof_claims: [visible]
    shared_route:
      checkpoints:
        - role: shared-owner
          path: shared/src/commonMain/TimedState.kt
      proofs:
        - path: shared/src/commonTest/TimedStateTest.kt
          claims: [behavior]
    projections:
      - id: bridge-shared
        targets: [bridge-ios, bridge-android]
        checkpoints:
          - role: projection
            path: adapters/bridge/TimedStateAdapter.kt
    target_routes:
      - target: web
        checkpoints:
          - role: renderer
            path: adapters/web/timed-state.ts
        proofs:
          - path: adapters/web/timed-state.test.ts
            claims: [visible]
      - target: bridge-ios
        checkpoints:
          - role: renderer
            path: apps/bridge/ios/TimedStateScreen.tsx
        proofs:
          - path: apps/bridge/e2e/ios/timed-state.test.ts
            claims: [visible]
      - target: bridge-android
        gap_kind: proof
        reason: The Android host proof has not been supplied.
        checkpoints:
          - role: renderer
            path: apps/bridge/android/TimedStateScreen.tsx
```

The example contains a proof gap, so its enabled pack fails. A tier, exclusion, or
`not-applicable` value cannot convert that gap into a pass.

### Top-Level And Area Fields

The graph requires:

- exact `kind` value `kmp-surface-validation`;
- exact `schema_version: 1`; unknown schema versions are structurally invalid;
- one repository-relative `target_catalog`; and
- a non-empty list of uniquely identified `areas`.

Each area requires a stable `id`, concise `summary`, `validation` depth, product `contract.path`, one
`shared_route`, optional projections, and no more than one target route for each catalog target.
Unknown fields fail schema validation.

A `route` area requires at least one shared checkpoint and at least one target-local checkpoint for
every target without a gap. It cannot contain proofs or guarded requirement fields.

A `guarded` area additionally requires non-empty `required_checkpoint_roles`,
`required_proof_claims`, and `required_target_proof_claims`. The target-local list must be a subset of
the area's `required_proof_claims`. Its shared route requires at least one checkpoint and proof.
Every complete target route requires at least one target-local checkpoint and proof.

### Route Components

A checkpoint contains a project-defined `role` and repository-relative `path`. A proof contains a
repository-relative `path` and one or more project-defined `claims`. Within one route component,
duplicate checkpoints and duplicate proof paths are invalid.

A projection has a unique area-local ID, applies to one or more unique catalog targets, and contains
at least one checkpoint or proof. Matching projection content is combined with the shared and target
routes. Projection targets must be catalog members. Projections do not refer to other projections.

For a guarded target without a gap:

- the shared route, matching projections, and target route together must contain every
  `required_checkpoint_roles` and `required_proof_claims` value; and
- proofs inside the target route alone must contain every `required_target_proof_claims` value.

Shared or projection proof cannot satisfy a target-local claim.

### Gaps

A target route is complete when it has no `gap_kind` and satisfies its area's structural rules.
`gap_kind` is `implementation` or `proof` and requires a reason. An optional owner may be recorded,
but ownership is not part of structural completeness.

An implementation gap may omit unfinished target-local structure. A proof gap is valid only for a
guarded area whose implementation route and composed checkpoint roles are complete. A proof gap on
a `route` area is structurally invalid. Both valid gap kinds produce blocking findings.

When a catalog target has no entry in an area, the validator reports an implementation gap for that
area and target. Adding a catalog target therefore fails every area until each contains a complete
route. An explicit gap may add a reason, but it remains blocking. Duplicate routes and routes naming
targets absent from the catalog are structurally invalid.

### Validation Subject And References

The graph, its catalog, and every reference are resolved from one validation subject:

- staged, branch-aware changed, and explicit-path runs reconstruct a read-only subject from the
  packet's captured base Git tree plus its immutable path overlay;
- changed graph or catalog documents use their packet after-images, while unchanged documents use
  their blobs from the captured base tree;
- deletions and renames update that same reconstructed subject before reference membership and file
  type are checked; and
- all mode reads the current checkout, as already authorized by the governance kernel.

A content-bound validator derives `scope`, `mode`, and `base_ref` from the runtime change packet; it
does not depend on a checker-specific command-line selection flag.

A content-bound run never falls back to the current index, working tree, or process directory. A
path absent from the reconstructed subject is missing even if it exists in the live checkout. This
requires a reusable runtime subject view rather than checker-specific Git or filesystem reads.

Contract, checkpoint, and proof paths must name regular files in that subject. Absolute paths,
parent traversal, paths outside the repository, NUL bytes, and symbolic-link escapes are invalid.
The validator checks reference membership and file type; it does not read proof or implementation
contents.

### Reusable Structured-Document Boundary

The graph and catalog use one runtime-owned structured-document loader with these generic limits:

- at most 256 KiB per encoded document, enforced by reading no more than the limit plus one byte;
- no duplicate YAML mapping keys or JSON object member names;
- at most 32 nested mapping or sequence levels per document;
- at most 20,000 combined mapping entries and sequence items per document;
- at most 16,384 UTF-8 bytes per scalar string and 4,096 UTF-8 bytes per path value; and
- at most 500 returned findings, including one deterministic `structure-invalid` truncation finding
  when more would otherwise be returned.

An encoding, duplicate-key, or limit failure produces `kmp-surface.structure-invalid` and stops
semantic validation; partial input is never accepted. These are reusable parser and output safety
bounds, not KMP-specific target, area, projection, or reference-count policy.

## Validation And Pack Result

The built-in validator:

1. resolves the graph, catalog, and reference metadata from one validation subject;
2. parses the graph and referenced catalog within the reusable bounds and applies their exact
   Version 1 schemas;
3. validates IDs, uniqueness, repository-relative references, and target membership;
4. applies each area's `route` or `guarded` contract;
5. combines shared, matching projection, and target-local roles and claims;
6. checks guarded target-local claims using only target-route proof;
7. reports missing catalog routes and declared gaps by gap kind; and
8. returns deterministic findings without rewriting either input.

The built-in uses the existing pack result envelope defined by the
[governance runtime](governance-kernel.md): one `status` and one `findings` array. It introduces no
second result schema or exit contract. Findings use these stable rule IDs:

| Rule ID | Meaning |
| --- | --- |
| `kmp-surface.structure-invalid` | A graph or catalog schema, identity, composition, or safety-bound rule is invalid. |
| `kmp-surface.reference-invalid` | A required graph, catalog, contract, checkpoint, or proof path is missing or unsafe. |
| `kmp-surface.implementation-gap` | A catalog target has no complete implementation route for an area. |
| `kmp-surface.proof-gap` | A guarded target has no complete required proof. |

Every finding is blocking. A valid and complete graph returns `passed`; any structural finding or gap
returns `failed`. The validator never treats structural success as behavioral proof.

Each finding contains `severity: "blocking"`, `rule_id`, and `message`. It includes `area_id`,
`target_id`, and `path` when those coordinates apply.

Before the 500-finding cap is applied, findings are ordered by `rule_id`, `area_id`, `target_id`,
`path`, and `message`, with absent values treated as empty strings. Input mappings and semantically
unordered ID lists are traversed canonically, so equivalent document reordering produces the same
finding array. If a 501st finding would be emitted, validation stops, the retained findings are
sorted by the stated key, and the final item becomes the stable truncation finding.

## Enablement And Lifecycle

Installation alone creates no catalog, graph, pack, hook, or automatic check. An adopter enables the
feature by registering one active target-owned pack:

```yaml
id: kmp-surface-validation
label: KMP surface validation
implementation_status: active
enforcement: blocking
stages: [pre-push, ci-pr, release]
run_when: matched
path_globs:
  - config/validation/kmp-surface-targets.json
  - config/validation/kmp-surfaces.yaml
  - product/interface/**
  - adapters/interface/**
depends_on: []
commands:
  - builtin: kmp-surface-validation
```

The stage list is a recommendation, not a requirement. The adopter may choose any stages accepted by
the ordinary pack contract. Pre-commit remains available but is not recommended or generated.

The built-in reads only the conventional graph path; no pack-command argument or second discovery
mechanism is needed. The graph areas declare which cross-surface capabilities are covered. Product
path selectors decide when the pack runs; Governance does not infer scope from them. Changes to both
the graph and target catalog must select the pack. Explicit named-pack execution intentionally
bypasses changed-path selection; automatic lifecycle execution uses the ordinary selectors.

Agents and operators run the validator through the existing command:

```text
project-governance check --pack kmp-surface-validation
```

There is no separate KMP Surface Validation CLI, graph discovery mechanism, or generated registry.

## Agent Discovery And Maintenance

Installed KMP guidance must make the disabled capability discoverable without creating another skill
registry. Implementation adds graph discovery and maintenance to the existing `kmp-implementation`
router because it selects for ordinary KMP feature work. The existing `kmp-test-and-evidence` leaf
adds only the proof-specific obligations used when test or evidence work selects it.

For KMP-backed surface work, the selected guidance instructs an agent to:

1. run `project-governance plan --pack kmp-surface-validation --json` to detect the enabled pack,
   then read the conventional graph and its target catalog;
2. route platform-exclusive work to platform-owned validation;
3. locate the affected cross-surface area or decide that a new area is required;
4. update all catalog target routes when adding an area or target;
5. update target-local proof references when bindings, hosts, renderers, or evidence ownership move;
   and
6. run the active pack through `project-governance check --pack kmp-surface-validation`.

The runtime cannot infer that an arbitrary source edit creates a new cross-surface capability. Agent
routing and review own that decision; the validator ensures that declared targets and areas cannot be
silently omitted.

Because the installed KMP guidance has a frozen evaluation record, changing its router, leaf,
manifest, or referenced material requires focused KMP skill re-evaluation and refreshed body digests
in the [KMP V0 evaluation](../reference/kmp-skill-v0-evaluation.md) before the runtime release. This is
a release gate, not a validator finding. A source edit without that release proof is incomplete.

## Doctor Contract

When no active pack invokes the built-in, `doctor` reports no feature-specific finding. When enabled,
it fails closed on:

- any active invocation from a pack other than `kmp-surface-validation`, or multiple active
  invocations of the same built-in;
- a missing, unsafe, unreadable, or invalid graph or target catalog;
- failure to select the graph or target catalog through the pack's path globs; or
- absence of an adopter context route that selects `kmp-implementation`.

The context requirement is satisfied only by `kmp-implementation` in a route's `skills`;
`context_router.default_skills` materializes the router body but cannot compose its proof leaf.
Doctor applies the ordinary pack schema to adopter-chosen stages but requires no feature-specific
stage set: each declared stage must have at least one applicable command under the existing pack
contract. Existing context selection owns missing or stale skill materialization. Doctor returns its
existing string findings; the stable KMP rule IDs apply to pack results only. Doctor does not run
target proof or discover external target inventories.

## Ownership Boundary

| Concern | Owner |
| --- | --- |
| Schemas, subject reconstruction, bounded parsing, route composition, built-in validation, deterministic findings, and stable rule IDs | Runtime wheel |
| Existing KMP router and evidence guidance | Runtime wheel |
| Target catalog, graph, areas, paths, roles, claims, gaps, and optional gap owners | Adopting repository |
| Pack selectors, stages, proof execution, CI lanes, devices, and evidence retention | Adopting repository |
| Whether work is platform-exclusive or changes a cross-surface capability | Implementing agent and reviewer under adopter policy |
| Runtime release, adopter upgrade, and activation | Operator |

The wheel contains no adopter identities, product paths, graph instances, target evidence, or
provider-specific integration.

## Conformance Cases

Focused fixtures prove:

- installing the capability without an active pack changes no behavior;
- a JSON target catalog and shallow `route` area pass without proof fields (`passed`);
- a `guarded` area requires composed roles and claims plus target-local proof claims
  (`kmp-surface.proof-gap` when proof is absent);
- shared or projection proof cannot satisfy `required_target_proof_claims`
  (`kmp-surface.proof-gap`);
- adding a catalog target produces `kmp-surface.implementation-gap` in every uncovered area;
- declared implementation and proof gaps produce their distinct blocking rule IDs, while a proof
  gap on a `route` area is `kmp-surface.structure-invalid`;
- tiers, exclusions, target subsets, `not-applicable`, proof fields on `route` areas, unknown schema
  versions, duplicate projection targets, and non-catalog projection targets are rejected;
- missing or unsafe references and duplicate or unknown route targets fail structurally;
- two host targets may share a projection while retaining separate target routes and proof;
- a staged catalog after-image is never combined with an unstaged graph or live reference; unchanged,
  deleted, and renamed paths are resolved from the same reconstructed packet subject;
- all mode resolves the same graph, catalog, and references from the live checkout;
- oversized or deeply nested documents, duplicate YAML or JSON keys, oversized path values, and
  finding overflow fail with bounded `kmp-surface.structure-invalid` output;
- semantically equivalent input reordering produces an identical ordered finding array;
- an implementation-shaped KMP task selects graph-maintenance guidance and a proof-shaped task
  selects the evidence leaf;
- `doctor` accepts coherent adopter-chosen lifecycle stages and validates route-local KMP guidance
  plus the enabled wiring; and
- the wheel installs cleanly with no adopter knowledge or automatic repository changes.
