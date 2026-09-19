# Project Harness

A small runtime that makes work resumable, keeps actions within scope, and preserves evidence.

It remembers what the operator asked for, checks that work stays inside its declared scope, fetches
the right version of the right files, runs declared checks, and records what actually happened — so
a fresh session can continue accurately. It is useful with zero model calls; a decision model is an
optional optimization that must stay removable.

The host keeps the reasoning and the pen: the harness does not write to a working tree.

- [Charter](CHARTER.md)
- [Specifications](docs/specs/README.md)
- [Plans](docs/exec-plans/README.md)
- [Baseline findings](docs/research/pass-a-baseline.md)

Requires Node 22.18 or newer. No runtime dependencies.
