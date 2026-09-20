# Project Harness Agent Instructions

A runtime for resumable work, scoped actions and preserved evidence. Keep this file compact;
durable decisions live under `docs/**`.

Follow the [charter's design principle](CHARTER.md#design-principle): diagnose first, add the
smallest change that earns its cost, remove what no longer helps.

## Non-Negotiables

- The harness does not write to a working tree. It reads, delegates declared checks to governance, and records.
  The host performs every product-source edit. `init --apply` is the explicit host-instruction installer.
- Never write outside this repository. Other repositories are read-only.
- Execution-critical state is durable before the action it covers; analytics is best-effort.
- No provider or model call is required for any core path.

## Start Here

- [Specifications](docs/specs/README.md) — the four objects and their contracts.
- [Plans](docs/exec-plans/README.md) — the pass and step sequence.
- [Reviews](docs/reviews/) — two independent reviews and their reconciliations.
- [NIGHT-PROGRESS.md](NIGHT-PROGRESS.md) — current state and the working log.

## Stack

Node 22 with native TypeScript type stripping, `node:sqlite`, and `node:test`. No runtime
dependencies, no build step, no framework. Keep it that way unless something earns its cost.

```sh
npm test
npm run typecheck
```
