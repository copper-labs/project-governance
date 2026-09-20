# Current progress — 2026-09-19

The architecture reset replaces the initial prototype and stale implementation plans. Current
behavior lives in docs/specs. See docs/exec-plans/active/2026-09-19-architecture-reset.md for this
work and docs/exec-plans/README.md for pilot/qualification gates.

Implemented: immutable retrieval and live byte reads; mandatory context and shared budgets;
versioned task authority; durable governance execution binding and observational recovery;
compact resume/checkpoints; stable workspace/session attempts; advisory read/write drift;
pinned fork lineage; explicit merge reconciliation; selected exports and inert imports; nullable
native usage accounting; bounded host routing. SQLite remains the operational owner.

Validation: 71 tests, typecheck and whitespace checks pass. Claude Opus 5 xhigh review and
focused rechecks are reconciled with no review blocker. See
[the delivery receipt](docs/reviews/2026-09-19-implementation-reconciliation.md).
Real host qualification, published runtime certification and measured savings remain separate.
Earlier progress details remain in Git history; they must not be read as current completion proof.

## Accepted next scope — 2026-09-19

Specifications now define the harness as a governance-required continuity module, with one governance
product/install/release and Codex-only first adoption. Cowork is deferred. The new active plan is
[governance + Codex adoption](docs/exec-plans/active/2026-09-19-governance-codex-adoption.md).
Added installation, development-loop, bounded measurement/qualification and repository-discovery
contracts plus a [three-stage process map](docs/architecture/development-flow.md). JEV is one optional
decision adapter, not a required core path or check authority. First-release benefit numbers are
explicit planning assumptions, not measured savings.

This follow-up changed documentation only. Bundled packaging, retention/reporting, benchmark runner,
real Codex qualification and automatic proof/hook/device integration remain pending. Earlier test
and review results above apply to the previous implementation; they do not certify these additions.
