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
- Keep model-specific files thin. Shared process belongs in Markdown and the packaged runtime.
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
- Use the installed runtime's ignored skill discovery path for generic skills. Keep project-specific
  skills with their owning project.

## Current Source Commands

The compiled TypeScript package owns current source development under `components/engine` and
`components/harness`. Use the root package's Node version (`>=24.16.0 <25`) and explicit entry:

```sh
npm ci --ignore-scripts
npm ci --prefix components/harness --ignore-scripts
npm run build
node dist/engine/src/cli.js --help
```

Run the owning batch's focused checks at its declared checkpoint. An adopting repository uses its
pinned `project-governance` entry and versioned installation contract, not this source invocation.

## Existing Source Hook Authority

Normal source Git hooks retain their existing Python owner until deliberate cutover. The command
below runs that source hook owner; it does not invoke the compiled TypeScript engine:

```sh
python3 -m pip install -r requirements-dev.txt
tools/run-source-governance.sh check --summary --stage pre-commit --mode impacted --staged
```

## Validation

- Plan coherent implementation batches and their test checkpoints using the
  [validation strategy](docs/governance/validation-strategy.md). Run focused checks during work;
  consolidate QA, documentation, and integrated proof at the declared batch boundary.
- Run broad proof only for a runtime release, configuration-schema migration, hook or selection
  contract change, security/process-isolation boundary, scheduled reconciliation, or explicit
  operator request.
- Current package proof builds the compiled archive, inspects its boundary, and installs it into a
  clean temporary environment. Retained wheel changes use their owning release proof.

## Continuity module

`components/harness` owns the TypeScript task/evidence store and bounded resume. Read its scoped
instructions for module work. The root compiled package includes this canonical source; retained
wheels embed it for their installed generation. Never maintain a second checked-in copy under Python
assets. Run module tests and typecheck for its changes, and installed-package proof for packaging or
executor-boundary changes.
