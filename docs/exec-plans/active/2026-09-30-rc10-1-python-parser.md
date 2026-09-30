---
id: plan.rc10-1-python-parser
title: RC10.1 Python Parser Repair
type: exec-plan
status: active
owner: project-governance
created: 2026-09-30
updated: 2026-09-30
summary: Repairs valid Python AST encoding and qualifies one compiled hotfix without changing policy or adopter pins.
---

# RC10.1 Python Parser Repair

Valid conditional expressions and lambdas expose a scalar AST body where the shared bridge
expects a list. An unnamed exception handler can also supply a null name. Repair those shapes
in the existing bridge and retain positive location defaults rather than weakening AST validation.
The [kernel contract](../../specs/governance-kernel.md#built-in-packs) remains the policy owner.

## One bounded implementation batch

- [x] Normalize Python AST shapes without changing metrics, comment policy, syntax failures,
  configuration, JEV selection, package dependencies or the retained Python wheel owner.
- [x] Add generic current/before-image regressions and compiled installed-package proof for
  conditional expressions, lambdas, unnamed handlers, documentation, decorators and failures.
- [x] Run focused tests and type checking, then freeze the implementation for one narrow
  Opus 5.5 medium review. Reconcile actionable findings at the affected seam.
- [x] Run the full compiled test suite and offline installed-archive proof once at the release
  boundary. Check frozen real-repository Python images externally without executing project code.
- [ ] Commit through normal hooks and publish `3.0.0-rc.10.1` through the existing tag workflow.
  Confirm successful CI, immutable prerelease status, exact source, archive and metadata hashes.

Local qualification passed: 797 compiled tests, type checking, 15 final focused checks, the offline
installed archive and eight frozen real-repository Python images. Opus 5.5 medium found no release
blockers. Low-priority assertion and proof-label refinements received focused rechecks; the runtime
implementation remained unchanged. Wildcard pattern syntax was not independently qualified and
does not introduce a new Python minimum in this hotfix.

## Adoption boundary

This release repairs Python analysis; it does not solve host/chat worktree attachment or tune
retrieval settings. Adopters retain their pins until a deliberate upgrade at a pause seam.
Verify each execution checkout separately and preserve any active local repair until replacement
is qualified. Keep adopter identities, source captures and operational evidence outside this repo.
