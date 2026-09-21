# Project Governance Agent Instructions

This repository defines a reusable, project-neutral governance runtime. Keep this file compact;
durable decisions and plans live under `docs/**`.

Follow the [charter's design principle](CHARTER.md#design-principle): diagnose first, add the smallest
change that earns its cost, and remove what no longer helps. Apply it to every proposed change;
do not turn it into another checklist or approval layer.

## Non-Negotiables

- Markdown owns rationale, judgment and rule-change authority. Explicit unified-engine execution
  uses one accepted declaration/code owner per machine rule; see the charter. Existing installed
  owners remain active until deliberate cutover. Git history preserves removed implementation.
- Keep product identities, paths, adopters, and runtime evidence outside this checkout.
- Keep model-specific files thin. Shared process belongs in Markdown and the wheel.
- Do not write into another repository unless the operator explicitly asks.
- Do not create compatibility shims, copied package code, or a second runtime authority.
- Remote publication, pushes, tags, and releases require explicit authorization.
- Before committing or preparing a pull request, follow the
  [change narrative contract](docs/specs/change-narrative-contract.md).

## Start Here

- Read `docs/index.md` and `CHARTER.md`.
- For developer-documentation work, read `docs/developer/index.md` and
  `docs/developer/catalog.yaml`. For runtime agent routing, follow its owning specification and
  source component.
- Read the smallest live specification or plan that owns the requested change.
- Use the installed wheel's ignored skill discovery path for generic skills. Keep project-specific
  skills with their owning project.

## Runtime Commands

```sh
project-governance init
project-governance doctor
project-governance plan --stage <stage> --mode impacted --json
project-governance check --stage <stage> --mode impacted --summary
project-governance check --pack <pack-id>
project-governance update --to <version> --dry-run
project-governance telemetry status
```

During source development, install development dependencies once and run the checkout package:

```sh
python3 -m pip install -r requirements-dev.txt
tools/run-source-governance.sh check --summary --stage pre-commit --mode impacted --staged
```

## Validation

- Plan coherent implementation batches and their test checkpoints using the
  [validation strategy](docs/governance/validation-strategy.md). Run focused checks during work;
  consolidate QA, documentation, and integrated proof at the declared batch boundary.
- Run broad proof only for a wheel release, configuration-schema migration, hook or selection
  contract change, security/process-isolation boundary, scheduled reconciliation, or explicit
  operator request.
- The source workflow builds the wheel, runs focused runtime tests, inspects its boundary, and
  installs it into a clean temporary environment.

## Continuity module

`components/harness` owns the TypeScript task/evidence store and bounded resume. Read its scoped
instructions for module work. Governance still owns policy and execution. The wheel includes the
runtime payload; never maintain a second checked-in copy under Python assets. Run module tests and
typecheck for its changes, and installed-wheel proof for packaging or executor-boundary changes.
