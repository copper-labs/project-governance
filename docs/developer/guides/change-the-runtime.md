---
id: developer-guide.change-runtime
title: Change The Runtime Safely
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-08-21
summary: Guides a source contributor from authority and ownership through focused proof and one final affected sign-off.
---

# Change The Runtime Safely

Use this journey when you need to change the Project Governance source repository itself. You will
finish with one coherent owner change, its focused proof, one directly affected seam, and one final
branch-aware sign-off.

## Establish Authority And Ownership

Read `AGENTS.md`, [Documentation Index](../../index.md), and the smallest current specification or
plan that owns the behavior. Markdown owns active governance decisions. Current Python source and
tests own installed behavior. Git history preserves removed implementation.

Locate one implementation owner before editing. The public CLI is in
`src/project_governance_runtime/cli.py`; initialization and updates are in `installation.py`;
selection is in `planning.py`; execution is in `runner.py`; built-in checker entry points are under
`checker_scripts/`; installed generic guidance is under `assets/skills/`. The exact source proof and
release boundary is owned by the
[Validation Strategy](../../governance/validation-strategy.md).

Do not add adopter identities, paths, product evidence, copied runtime code, compatibility shims, or
a second policy authority to solve a source problem.

## Change And Prove One Owner

Install source-development dependencies once:

```sh
python3 -m pip install -r requirements-dev.txt
```

Make the smallest cohesive change. Run its focused unit or behavior test, then one directly affected
integration seam if the behavior crosses a boundary. For example, a CLI command that records
telemetry needs its command test and telemetry redaction/status test; it does not need every checker
test during the repair loop.

The source checkout command always imports this checkout rather than an older installed wheel:

```sh
tools/run-source-governance.sh check --pack <affected-pack>
```

Treat warnings, unexpected omissions, and process failures as evidence to investigate. Do not turn a
failed focused check into a broad replay.

## Finish The Candidate

When focused proof passes, freeze the candidate and run one affected source sign-off:

```sh
tools/run-source-governance.sh check --summary --stage pre-push --mode impacted
```

The result should identify the branch comparison base, selected packs, normalized outcomes, and no
blocking finding. A change to the candidate or its integration base invalidates that sign-off.

Runtime releases additionally require the complete test suite, wheel build, installed-wheel
verification, independent review, proposed-merge source readiness, an exact semantic tag, and
publication readback. Follow [Release Process](../../governance/release-process.md); never tag an
uncertified branch head merely because its focused tests passed.
