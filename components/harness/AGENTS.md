# Project Harness Agent Instructions

A runtime for resumable work, scoped actions and preserved evidence. Keep this file compact;
durable decisions live under `docs/**`.

Follow the [charter's design principle](../../CHARTER.md#design-principle): diagnose first, add the
smallest change that earns its cost, remove what no longer helps.

## Non-Negotiables

- The harness does not write to a working tree. It reads, delegates declared checks to governance, and records.
  The host performs every product-source edit. `init --apply` is the explicit host-instruction installer.
- Never write outside this repository. Other repositories are read-only.
- Execution-critical state is durable before the action it covers; analytics is best-effort.
- No provider or model call is required for any core path.

## Module commands

Run npm commands from this directory, or use `npm --prefix components/harness` from the repository
root. The root compiled package includes the canonical source and exposes
`project-governance harness`; retained wheels embed it for their installed generation. Root
governance instructions own cross-module work, source Git hook authority and release policy.

## Start Here

- [Specifications](docs/specs/README.md) — the four objects and their contracts.
- [Plans](docs/exec-plans/README.md) — the pass and step sequence.
- [Reviews](docs/reviews/) — two independent reviews and their reconciliations.
- [NIGHT-PROGRESS.md](NIGHT-PROGRESS.md) — the original module implementation log. Current release
  work follows the owning root plan under `../../docs/exec-plans/active/`.

## Stack

Use the root package's Node version (`>=24.16.0 <25`) for current source work. Module tests use
native TypeScript type stripping, `node:sqlite`, and `node:test`; the root package compiles this
module for distribution. The module has no runtime dependencies or framework.

```sh
npm test
npm run typecheck
```
