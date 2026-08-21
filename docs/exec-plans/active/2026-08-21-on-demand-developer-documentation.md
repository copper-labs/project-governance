---
id: exec-plan.on-demand-developer-documentation
title: Reader-First Authoring And On-Demand Developer Documentation
type: exec-plan
status: active
owner: project-governance
created: 2026-08-21
updated: 2026-08-21
summary: Deliver a minimal installable human and agent documentation system with local-first research-enabled authoring, validation, telemetry, and a 1.3.0 release.
---

# Reader-First Authoring And On-Demand Developer Documentation

## Final State

Project Governance 1.3.0 can install a minimal developer-documentation structure into an adopting
repository. One catalog routes humans and agents to the same canonical references, guides, and local
sources. The installed authoring skill establishes local project truth, performs permitted current
public research for bounded gaps, writes directly under the active task's authority, and completes
reader-first review.

The runtime adds no model client, web crawler, source-adapter framework, generated agent corpus,
authoring-packet protocol, document graph, scaffolder, synchronization command, or second
documentation pack. Existing documentation validation becomes module-aware. Existing local
telemetry records only initialization and exact-routing outcomes, duration, and bounded counts.

The release is proven through this repository's semantic pilot and an independent clean temporary
adopter, reviewed by Claude Opus 5 at high effort, reconciled, certified on one publication
candidate, published as `1.3.0`, and read back from the immutable release.

## Baseline

- Source baseline: `canonical/main@178b5909bf53814b92a6704b6a6d3437febb2b49`
- Working branch: `codex/reader-first-technical-authoring`
- Canonical remote: `https://github.com/copper-labs/project-governance`
- Prior stable release: `1.2.7`
- Target stable release: `1.3.0`
- Remote publication: authorized by the operator's explicit release request

## Fixed Decisions

1. The reader-first specification owns prose, research, and editorial judgement. The on-demand
   documentation specification owns installation, catalog routing, deterministic validation, and
   telemetry.
2. `project-governance docs init [--dry-run]` installs only `index.md`, `catalog.yaml`, and empty
   `guides/` and `reference/` directories under the configured root.
3. The module extends `config/governance/profile.yaml`; it creates no second configuration file.
4. The minimal catalog requires `id`, `title`, and one canonical `reference`. Exact aliases,
   symbols, tasks, guides, and sources are optional.
5. `docs route` matches exact capability ids, aliases, or symbols. It performs no fuzzy ranking,
   model inference, or corpus loading.
6. The installed host-agent skill performs local inspection, bounded public research, drafting,
   verification, and review directly. There is no runtime inventory, plan, or scaffold command.
7. The existing `documentation` pack owns module configuration, catalog, route, path, and link
   checks. There is no additional pack.
8. Research is `allowed` or `disabled`. Citation recency, research notes, example execution, and
   prose quality remain editorial or project-specific concerns.
9. Documentation telemetry is local, advisory, fail-open, and content-free. It measures operational
   adoption and friction, not documentation correctness or reader success.
10. Existing documentation stays in place and migrates only through normal project-owned lifecycle
    work.

## Execution Rules

- Establish a local specification checkpoint before implementation.
- Change one owner, run its focused tests, then cross one directly affected seam.
- Preserve ordinary `init`, existing CLI, pack selection, documentation behavior, and telemetry
  privacy unless this plan explicitly extends them.
- Keep all writes repository-contained and preserve adopter-authored profile and documentation text.
- Run broad source readiness once on the frozen publication candidate.
- Keep Claude read-only; reconcile its findings against local source and proof.
- Do not merge, tag, or publish until the certified candidate is stable.

## Slice 1: Align Authority And Install The Authoring Workflow

- Ownership: authoring PRD/specs, source writing guide, owning indexes, retirement of the redundant
  operator reference, `technical-authoring` skill, one cataloged reader-first field guide, affected
  skill reads, package manifest, and focused skill tests
- Work:
  - Reconcile durable docs to the approved lean design and explicit current-versus-target state.
  - Keep the source writing guide a short local overlay and retire the duplicate operator reference.
  - Install one field guide covering reader contract, story spine, local claim extraction, permitted
    public research, untrusted retrieved content, citations, direct authoring, verification, and
    review.
  - Align optional target reads with the current skill catalog input contract.
- Acceptance:
  - One concern has one authority and no shared checklist is duplicated in full.
  - The installed skill works without target `docs/governance/**` files.
  - Wheel inspection finds the field guide and updated skill.
- Focused proof: documentation and format packs, skill payload tests, and wheel asset inspection
- Proof state: not-run

## Slice 2: Implement Minimal Initialization And Exact Routing

- Ownership: one `documentation.py` domain module, `cli.py`, neutral templates, package manifests,
  and focused documentation command tests
- Commands:

  ```sh
  project-governance docs init --dry-run
  project-governance docs init
  project-governance docs route --capability <id-or-alias> --json
  project-governance docs route --symbol <exact-symbol> --json
  ```

- Work:
  - Load and validate the existing profile's optional `documentation` section.
  - Preview or append the default section without reformatting existing profile text.
  - Create only missing index, catalog, and directories at a repository-contained root.
  - Load the minimal catalog, permit project-owned extra keys, and validate shared fields.
  - Return exact matched, ambiguous, not-found, disabled, invalid, dry-run, initialized, and
    unchanged results with stable JSON-compatible envelopes.
- Acceptance:
  - Clean, repeated, dry-run, custom-root, disabled, malformed-profile, conflict, traversal,
    absolute-path, and symlink-escape initialization cases are proven.
  - Id, alias, symbol, duplicate, missing-reference, invalid-catalog, and not-found routes are proven.
  - No route performs fuzzy matching or returns unrelated corpus content.
  - Ordinary initialization and existing CLI tests remain unchanged.
- Focused proof: documentation command tests plus installation and CLI regression tests
- Proof state: not-run

## Slice 3: Extend Existing Validation And Bounded Telemetry

- Ownership: existing documentation pack and checker, telemetry schema/status, command telemetry
  hooks, selection configuration, and focused documentation/telemetry tests
- Work:
  - Select the existing documentation pack for changed module profile and catalog paths.
  - Validate enabled profile shape, contained root, entry files, catalog records, exact route
    uniqueness, and local reference/guide/source existence without adding a pack.
  - Record one `documentation-terminal` event for init or route with operation, outcome, duration,
    dry-run and bounded counts only.
  - Add a `documentation` summary to `telemetry status` with counts, outcomes, durations, and explicit
    observation exclusions.
- Acceptance:
  - Module checks run only when enabled and relevant; disabled adopters gain no new blocker.
  - Existing Markdown validation and selection behavior regressions pass.
  - Persisted telemetry contains no query, ids, aliases, symbols, paths, content, prompts, citations,
    research, or model fields.
  - Telemetry loss does not affect command outcome and status describes what it cannot measure.
- Focused proof: documentation checker, selection, telemetry redaction/retention/failure/status, and
  command hook tests
- Proof state: not-run

## Slice 4: Pilot, Review, Certify, And Release 1.3.0

- Ownership: this repository's profile and `docs/developer/**`, bounded README/index/guide changes,
  the active plan, release candidate, and publication evidence
- Work:
  - Install the module from the built wheel into a clean temporary adopter and prove init, route,
    validation, telemetry, and authoring with research disabled.
  - Install and use the module in this repository for one evaluator/operator journey and one
    source-contributor journey, with matching exact agent routes.
  - Use permitted current public research only where it materially improves explanation; preserve
    direct citations and uncertainty.
  - Freeze the implementation candidate and run Claude Opus 5 with `--effort high`, fallback
    disabled, and read-only plan permissions over the specifications, diff, tests, telemetry, and
    release boundary.
  - Reconcile all verified critical, high, and medium findings. Recheck material fixes with the same
    model and boundary.
  - Run focused proof, complete runtime tests, built-wheel verification, documentation/format packs,
    and one impacted pre-push sign-off on the final candidate.
  - Open a ready pull request against canonical `main`, require the source-readiness workflow on the
    proposed merge result, merge the certified candidate, tag `1.3.0`, and verify the publication
    workflow and immutable release assets.
- Acceptance:
  - Human and exact agent routes reach the same canonical reference and current local evidence.
  - The clean adopter proves no source-checkout or product coupling.
  - Claude has no open verified critical, high, or medium finding after reconciliation.
  - Source readiness passes on the candidate merge result before integration.
  - Tag target, lock source commit, lock/wheel versions, and wheel SHA agree after publication.
- Proof state: not-run

## Simplification Record

The approved 2026-08-21 pass removed the generated agent index and sync command, source adapters and
inventory, formal authoring packets, scaffolding, separate documentation configuration and pack,
natural-language route ranking, empty directory taxonomy, typed document graph, global research
freshness enforcement, example-proof subsystem, migration machinery, and broad catalog vocabulary.

The surviving V1 is deliberately small: one installed skill and field guide, one profile extension,
one index, one catalog, one exact route command, one existing validation pack, and one bounded
telemetry event family.

## Stable-Candidate Proof

On one frozen candidate:

1. Run focused skill, documentation command, checker, selection, telemetry, installation, and
   release-version tests.
2. Build the wheel and inspect its skills, templates, commands, and checker boundary.
3. Install the wheel into a clean environment and clean adopter; run both pilot routes.
4. Run all `test_runtime_*.py` tests and `tools/verify-runtime-wheel.py`.
5. Run documentation, format, prose, and impacted pre-push proof once.
6. Obtain and reconcile the requested Opus review before source readiness.
7. Verify the proposed merge result, immutable tag, publication workflow, wheel, and lock.

## Rollback

Revert the documentation domain, CLI wiring, templates, skill resources, checker extension, and
telemetry event as one feature boundary. Revert the source pilot through Git. Ordinary runtime
installation, existing documentation validation, and existing telemetry remain authoritative. Do
not preserve compatibility copies or a second authoring route.
