# Project Governance Agent Instructions

This repository defines a reusable, project-neutral governance runtime. Keep this file compact;
durable decisions and plans live under `docs/**`.

## Non-Negotiables

- Markdown is the active governance authority. Git history preserves removed implementation.
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
project-governance check --stage <stage> --mode impacted
project-governance check --pack <pack-id>
project-governance update --to <version> --dry-run
project-governance telemetry status
```

During source development, install development dependencies once and run the checkout package:

```sh
python3 -m pip install -r requirements-dev.txt
tools/run-source-governance.sh check --stage pre-commit --mode impacted --staged
```

## Validation

- Change one owning component, run its focused test, then run one directly affected integration
  seam.
- Run broad proof only for a wheel release, configuration-schema migration, hook or selection
  contract change, security/process-isolation boundary, scheduled reconciliation, or explicit
  operator request.
- The source workflow builds the wheel, runs focused runtime tests, inspects its boundary, and
  installs it into a clean temporary environment.
