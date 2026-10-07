# Project Governance Charter

`project-governance` provides a reusable, project-neutral governance and development runtime. Current
source development produces the compiled TypeScript npm package `@organta/project-governance`. This
repository is not a project instance and contains no product-specific policy or operational data.

## Focus

- Markdown is the active authority for governance decisions, plans, and documentation.
- The compiled package contains generic runtime behavior, checks, schemas, shared skills and the
  canonical continuity module. Retained Python wheels serve their existing installed generation.
- A project owns its profile, facts, extension packs, documentation, and thin integration files.
- Projects pin an exact runtime artifact. Adoption is deliberate unless a tracked opt-in authorizes a
  compatible update at top-level task startup; source changes never alter another project's lock.
- Narrow checks are the normal loop. Broad proof is reserved for shared boundaries and explicit
  reconciliation.

## Runtime authority

The compiled engine combines governance, continuity, approved workflow execution, context and
evidence. The [target specification](docs/specs/unified-development-engine.md),
[category inventory](docs/reference/2026-09-20-engine-migration-inventory.md) and
[transition closeout](docs/exec-plans/active/2026-09-20-unified-development-engine.md#implementation-closeout)
preserve the migration rationale and explicit qualification limits. Current source execution is
explicit; existing installations, source Git hooks and shared startup handlers retain their owners
until deliberate cutover. A source build or document edit does not perform that cutover.

## Executable policy boundary

For explicit unified-engine execution, accepted machine rules have one typed declaration or code
owner. Shipped schemas own validation constraints; the engine validates them without maintaining a
second set of thresholds. Markdown retains rationale, human judgment, and authority to change rules
or exception policy. Model output cannot change enforcement or grant an exception.

This is the accepted N11 boundary for explicit compiled-engine execution. It does not switch an
existing installation, source hook, or shared startup handler. Do not run both owners for the same
operation.

## Design Principle

**Diagnose first. Add the smallest change that earns its cost. Remove what no longer helps.**

Start with an observed failure and its cause before proposing another control, abstraction, or
workflow. Prefer simplifying or reusing an existing mechanism. Judge additions by better accepted
outcomes relative to elapsed time, token use, runtime overhead, and maintenance cost; fewer commands
alone do not establish improvement. Test uncertain benefits with a small representative comparison,
and remove or revise an intervention when evidence or improved host/model capabilities makes it
unnecessary. This principle guides engineering judgment; it adds no approval form or reporting gate.
