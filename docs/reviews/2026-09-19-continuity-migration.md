---
id: review.continuity-migration
title: Continuity Migration Receipt
type: review
status: current
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Records source consolidation and exact local installed-wheel qualification.
---

# Continuity migration receipt

Source consolidation and local wheel integration are complete. Project Harness is developed here
under `components/harness`; the original checkout remains a frozen reference and backup location.
The [machine-readable receipt](2026-09-19-continuity-migration.json) identifies the exact tested source
and artifact. This is local integration evidence, not a published release or native-hook certificate.

## Delivered

- Imported all 84 source files and preserved the original Git ancestry through a non-squashed merge.
- Retained the approved source snapshot before import without disturbing the original working index.
- Added a single-wheel payload assembled from canonical TypeScript sources; no checked-in duplicate.
- Exposed `project-governance harness` and `harness` through one launcher. It checks Node/SQLite,
  retains the runtime-reader lease and binds defaults to its installed governance executor.
- Kept ordinary governance usable without Node. No standalone harness package is published.
- Extended existing CI readiness/publication with module tests/typecheck and installed continuity proof.
- Updated product/module navigation and the current installation contract; one source home owns edits.

## Findings resolved during migration

The imported development dependencies used ranges and a too-recent type package. Pinning TypeScript
5.9.3 and Node types 22.19.0 satisfied existing governance policy and passed typecheck. Exact registry
release evidence is recorded in the normal policy registry. No dependency-policy exception was added.

Formatting ownership now covers nested launchers and environment examples. Imported Markdown hard
breaks were normalized. The previously reviewed large CLI/store boundaries have explicit scoped
architectural dispositions; migration did not split transaction ownership or rewrite command routing.

A deeper checkout path exposed a resume-budget edge: final metadata was added after page filling.
Metadata is now reserved first, and cursor growth is counted before admitting an event. A regression
covers six tight budgets; constraints and output limits remain intact.

Source-distribution wheels previously omitted existing checker/default/launcher assets. The manifest
now carries those declared families. Rebuilt checkout and archive wheels contain identical file
contents, including all 263 distribution entries. No runtime dependencies or build framework were added.

## Verification

- Python runtime suite: 468 tests, passing with one skip.
- Module suite: 72 passing on the minimum supported Node 22.18.0; typecheck passes.
- Earlier migrated module suite also passed on the host Node 24.16.0 before the added budget regression.
- Installed source-distribution wheel on Node 22.18.0: task creation, persisted checkpoint/resume,
  real executor pass/fail and subsequent observation, missing-Node refusal and ordinary governance
  availability passed. The existing installed-wheel suite also exercises startup update/recovery.
- Source history reachability and full imported file inventory verified. All substantive normalization
  and integration changes are represented by commits; runtime databases were not moved or merged.
- Commit hooks passed without disabling gates. The final local sign-off is recorded separately at cutover.

The exact source artifact precedes this documentation receipt. Later receipt-only commits do not
change executable code but produce a different development version if rebuilt. Use the recorded hash
when referring to the tested wheel, not an inferred HEAD artifact identity.

## Remaining adoption work

No push, tag, release, existing runtime replacement or adopter lock update was performed. Codex native
hooks and automatic session lifecycle integration remain unqualified. Bounded telemetry aggregates,
next-proof automation and one project device workflow remain in the adoption plan. Cowork, JEV,
semantic indexing and Mnemos remain deferred. Existing explicit CLI operation is available now.

Contributors run Node commands from `components/harness` or use npm's `--prefix` flag. An installed
wheel uses its embedded sources; invoking source Python without first building/installing its payload
is not an installed-product qualification path. The module's source launcher remains available for
focused development.
