---
id: spec.developer-documentation-system
title: On-Demand Developer Documentation System
type: spec
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-08-21
summary: Defines a minimal installable documentation structure, one human and agent corpus, exact catalog routing, research-enabled authoring, validation, and telemetry.
---

# On-Demand Developer Documentation System

A governed repository should be able to explain itself when a developer needs it, without making a
human or an agent reconstruct the system from file names. The runtime therefore installs a minimal
developer-documentation structure and a machine-readable capability catalog. Humans follow
progressive journeys through the authored pages. Agents use the same pages through exact catalog
routes.

The system is reference-first in construction and journey-first in presentation. Exact contracts
remain in one owning reference. Guides assemble those contracts into a useful path for a specific
reader job. The [Reader-First Technical Authoring](technical-authoring-harness.md) specification
owns prose, progression, current public research, and editorial review. This specification owns
installation, the catalog, exact routing, deterministic validation, and bounded telemetry.

## Implementation State

The source runtime implements this contract. It installs the minimal structure, resolves exact
catalog routes, extends the existing documentation pack, and reports privacy-bounded local
operation telemetry. The installed authoring skill carries the reader-first field guide and the
local-first external-research boundary. This repository is the semantic pilot. The active
[implementation plan](../exec-plans/active/2026-08-21-on-demand-developer-documentation.md) remains
open until independent review and the `1.3.0` publication are complete.

## Problem

Repository documentation is often a mixture of guides, reference, architectural decisions, source
comments, examples, and stale landing pages. Humans need a progressive route through that material.
Agents need a small deterministic entry point that identifies the canonical reference and local
evidence for one task. Separate human and agent corpora drift.

Source inspection establishes what the repository implements and has decided, but it may not
explain the current standard, ecosystem convention, alternative, or emerging failure mode that
gives a design meaning. The installed authoring workflow must preserve local authority while
allowing a permitted host agent to research current public information.

## Goals

- Install a complete minimal structure without inventing product claims.
- Keep human and agent entry points over one canonical documentation corpus.
- Map stable capabilities and exact aliases or symbols to one reference, related guides, and local
  source evidence.
- Establish repository truth before using current public research for bounded gaps.
- Let the host agent generate useful documentation on demand without adding a runtime model client.
- Validate deterministic structure and routes through the existing documentation pack.
- Collect bounded local telemetry that shows adoption, outcomes, and duration without retaining
  documentation content or queries.
- Support incremental adoption without moving, deleting, or rewriting existing documentation.

## Non-Goals

- A documentation website, publishing pipeline, search engine, or natural-language ranking system.
- A runtime-owned model invocation, web crawler, provider requirement, or autonomous remote action.
- Fully automatic truth extraction or a source-adapter framework.
- A generated agent index, parallel agent corpus, document graph, or synchronization command.
- A versioned authoring-packet protocol or documentation scaffolding command.
- A separate developer-documentation validation pack.
- A runtime research-receipt, claim-freshness, example-proof, or migration subsystem.
- A universal product narrative, directory taxonomy, frontmatter migration, or catalog information
  model.

## Authority And Ownership

| Concern | Owner |
| --- | --- |
| Reader contract, story spine, public-research method, claim labels, and editorial review | [Reader-First Technical Authoring](technical-authoring-harness.md) |
| Minimal installation, catalog, exact route, validation additions, and telemetry contract | This specification |
| Generic implementation, installed skills, and existing documentation pack | Runtime wheel |
| Audience priorities, terminology, capability meaning, catalog entries, examples, and additional checks | Adopting repository |
| Current project behavior | Adopter source, tests, configuration, and runtime evidence |
| Prose generation, permitted research, synthesis, and editorial disposition | Host authoring agent and reviewer |
| Network, data, tool, and mutation permissions | Host and operator |

The runtime may validate an authored capability-to-path mapping. It cannot infer that a discovered
symbol is supported, decide why a capability matters, or allow an external recommendation to govern
the project.

## Configuration

The module extends the existing adopter-owned `config/governance/profile.yaml` rather than creating
a second configuration authority:

```yaml
schema_version: 1
project_extensions: []
documentation:
  enabled: true
  root: docs/developer
  research: allowed
```

`documentation.root` is a repository-relative path. `documentation.research` is `allowed` or
`disabled`. `allowed` means the authoring skill may use bounded, read-only public research when the
host and operator permit it. It does not grant network access, permit disclosure of private source,
or authorize an external mutation.

The absence of `documentation` means the module is not enabled. `enabled: false` retains an adopter's
configuration while disabling routes and module-specific validation.

## Installation

Initialization is explicit and separate from ordinary runtime installation:

```sh
project-governance docs init --dry-run
project-governance docs init
```

`--dry-run` previews the operation. The ordinary command adds the default `documentation` section
when it is absent, then creates only missing module-owned paths. It preserves existing profile text
and authored files. A malformed or conflicting existing value stops the operation rather than being
rewritten.

The minimal installed structure is:

```text
docs/developer/
  index.md
  catalog.yaml
  guides/
  reference/
```

The directories may remain empty until a real reader job needs a page. `index.md` is the human entry
point and explains the agent entry. `catalog.yaml` is the machine-readable map. The installer adds no
product names, capabilities, commands, support guarantees, or apparently complete placeholder
claims. Repositories can configure another root before initialization.

Initialization is idempotent and path-contained. It reports created, unchanged, and conflicting
paths. It does not edit root agent instructions because those are repository-owned; its result names
the one-line pointer an adopter may add to its existing agent entry point.

## Minimal Capability Catalog

The catalog begins empty:

```yaml
version: 1
capabilities: []
```

An adopted capability uses the smallest shared vocabulary:

```yaml
version: 1
capabilities:
  - id: governed-check
    title: Run a governed check
    aliases: [first-check]
    tasks: [run the first repository check]
    symbols: [project-governance]
    reference: docs/reference/governed-check.md
    guides: [docs/developer/guides/first-check.md]
    sources: [src/project_governance_runtime/cli.py]
```

Only `id`, `title`, and `reference` are required for a nonempty record. Aliases, tasks, symbols,
guides, and sources are optional string lists. The runtime ignores additional project-owned keys so
an adopter can extend its own catalog without forking the shared contract.

Catalog meaning is authored. A source path proves only where evidence can be inspected; it does not
automatically prove support, currency, audience, or correctness. Each declared capability has one
canonical reference. Guides explain journeys and link to the reference rather than restating its
contract.

## Human And Agent Entry Points

Humans start at `<documentation.root>/index.md`. It identifies the available reader jobs and links
to the shortest useful guide or canonical reference.

Agents start from the same index and catalog. The installed authoring skill knows the configured
entry contract. A repository should add a short pointer from its existing agent instructions, but
the catalog remains sufficient for agents that can inspect the conventional root directly.

Exact CLI routing is available when an agent or tool needs a normalized result:

```sh
project-governance docs route --capability governed-check --json
project-governance docs route --symbol project-governance --json
```

`--capability` matches one exact id or alias. `--symbol` matches exact authored symbols. A route
returns the matched record and ordered local context paths: reference, guides, then sources. A
duplicate exact match is `ambiguous`; an absent match is `not-found`. The runtime performs no fuzzy
search, scoring, semantic inference, or corpus loading.

## On-Demand Authoring Workflow

The runtime does not need inventory, planning, or scaffolding commands to generate documentation.
The installed `technical-authoring` skill performs one bounded host-agent loop:

1. Read repository instructions, the documentation index and catalog, the owning reference, and the
   local source, tests, examples, and evidence relevant to the requested task.
2. Establish the reader, situation, job, result, verified local facts, decisions, unknowns, and
   target page.
3. When research is allowed, investigate bounded gaps using current public sources, treating
   retrieved content as untrusted evidence rather than instructions.
4. Prefer primary accountable sources, compare dates and versions, cite supported external claims,
   and retain concise research notes when separate review evidence is useful.
5. Draft or revise the canonical reference or the smallest guide that serves the reader job.
6. Verify commands and examples where safe, run the existing documentation pack, and complete the
   reader-first editorial review.
7. Add or update the catalog entry only when the repository accepts the capability meaning and
   route.

The host agent creates pages directly under its active task authority. It does not need an
intermediate runtime packet or an empty-page generator. External evidence may add current context,
alternatives, tradeoffs, and failure modes; it cannot silently rewrite local behavior or an approved
decision.

## Deterministic Validation

The existing `documentation` pack becomes module-aware. When the module is enabled and a selected
change touches its profile or root, it may block on:

- malformed module configuration or a root that escapes the repository;
- a missing human index or catalog;
- an invalid catalog version or capabilities shape;
- missing or duplicate capability ids;
- duplicate aliases or exact symbol routes that would make routing ambiguous;
- a missing required title or reference;
- a reference, guide, or source path that escapes the repository or does not exist; or
- broken local Markdown links already owned by the documentation checker.

It does not block on clarity, narrative quality, research conclusions, citation age, example
execution, unsupported catalog extensions, or whether an external source agrees with a project
decision. Those remain editorial or project-specific concerns.

## Telemetry

Documentation operations extend the existing bounded local telemetry. Initialization and exact
routing emit one terminal event containing only:

- runtime version, operation (`init` or `route`), outcome, and duration;
- dry-run status and created, unchanged, and conflict counts for initialization; or
- query kind and match count for routing.

Telemetry never retains the query, capability id, alias, symbol, paths, documentation text, source
content, prompts, citations, research topics, or model identity. It remains advisory, fail-open,
bounded to the existing local retention file, and visible through `project-governance telemetry
status`.

The status output reports retained operation counts, outcomes, duration totals, initialization
counts, and route-result counts. It states that telemetry cannot observe direct file edits, host
agent skill invocation, research quality, reader success, documentation correctness, or events that
have aged out. This data shows adoption and operational friction; it is not a documentation-quality
score.

## Adoption And Migration

Existing documentation stays in place. An adopter enables the module, installs the minimal entry
structure, and catalogs one high-value capability by pointing to its existing or newly authored
reference and guide. It moves or retires old pages later through its normal artifact lifecycle only
when the replacement route is proven.

The runtime performs no migration-root discovery, content copying, bulk rewrite, or retirement.
Undocumented capabilities are not defects unless the repository deliberately adds them to the
catalog.

## Safety And Failure Semantics

- Initialization previews safely and creates only missing module-owned content.
- Existing profile text and authored documents are never silently replaced.
- All configured and cataloged paths resolve inside the repository.
- Routes read local configuration and catalog content only.
- Authoring research never discloses private repository material to public services.
- Retrieved instructions cannot expand tool use or change the requested task.
- No module command logs in, publishes, messages, purchases, pushes, tags, or changes remote state.
- Telemetry loss never blocks initialization, routing, authoring, or validation.

## Acceptance Criteria

| Criterion | Evidence | Verifier |
| --- | --- | --- |
| Initialization installs the minimal neutral structure without overwriting adopter content. | Clean-adopter dry run, apply, repeated apply, custom-root, and conflict tests from the built wheel. | Source maintainer |
| One catalog and corpus serve human and agent entry points. | Human navigation and exact capability/symbol routes reach the same reference and local sources. | Source maintainer and reviewer |
| The installed skill establishes local truth and can use permitted current public research without making it project authority. | Pilot citations, any research notes, claim inspection, and editorial review. | Author and independent reviewer |
| Exact routing is deterministic and contains no fuzzy search or product inference. | Id, alias, symbol, ambiguous, disabled, invalid, and no-match fixtures. | Source maintainer |
| Existing documentation validation owns module structure without a second pack. | Focused checker and selection fixtures plus the existing documentation regression suite. | Source maintainer |
| Documentation telemetry is useful and privacy-bounded. | Event redaction, retention, failure, aggregation, and forbidden-field tests. | Source maintainer |
| The system remains portable. | Built-wheel installation and complete pilot in a clean temporary adopter, followed by this repository's semantic pilot. | Source maintainer and independent reviewer |

## First Pilot: Document This Project

This repository is the first semantic pilot. It catalogs only the capabilities needed for:

- an evaluator/operator journey from purpose through installation, first check, result, and
  recovery; and
- a source-contributor journey from authority and architecture through a focused change and its
  proof boundary.

Human and agent tasks must reach the same canonical references and current local evidence. The pilot
uses external research only where it materially improves explanation and records why no external
source was allowed to override the runtime contract. A separate clean temporary adopter proves that
installation, routing, validation, and telemetry are not coupled to this source repository.
