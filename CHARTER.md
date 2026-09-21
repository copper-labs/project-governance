# Project Governance Charter

`project-governance` provides a lean, reusable Python runtime for governance checks. It is not a
project instance and contains no product-specific policy or operational data.

## Focus

- Markdown is the active authority for governance decisions, plans, and documentation.
- The standard wheel contains only generic runtime behavior, generic checks, schemas, and shared
  skills, including the internal TypeScript continuity payload.
- A project owns its profile, facts, extension packs, documentation, and thin integration files.
- Projects pin an exact wheel. Adoption is deliberate unless a tracked opt-in authorizes a
  compatible update at top-level task startup; source changes never alter another project's lock.
- Narrow checks are the normal loop. Broad proof is reserved for shared boundaries and explicit
  reconciliation.

## Unified development direction

The accepted direction is one development engine combining governance, continuity, approved workflow
execution, context and evidence. The [target specification](docs/specs/unified-development-engine.md)
and [category inventory](docs/reference/2026-09-20-engine-migration-inventory.md) distinguish preserved
intent from proposed implementation replacement. TypeScript is the planning baseline; packaging,
category dispositions and rule changes follow the declared transition. Current operational authority
and release behavior above remain effective until an accepted, qualified cutover. Mnemos needs are
designed now and adopted later. No new runtime or policy enforcement is established by a design document.

## Executable policy boundary

For explicit unified-engine execution, accepted machine rules have one typed declaration or code
owner. Shipped schemas own validation constraints; the engine validates them without maintaining a
second set of thresholds. Markdown retains rationale, human judgment, and authority to change rules
or exception policy. Model output cannot change enforcement or grant an exception.

This is the accepted N11 boundary for the qualified preview. It does not switch an existing
installation, source hook, or shared startup handler to that preview. Existing installations retain
their current owner until deliberate cutover; do not run both owners for the same operation.

## Design Principle

**Diagnose first. Add the smallest change that earns its cost. Remove what no longer helps.**

Start with an observed failure and its cause before proposing another control, abstraction, or
workflow. Prefer simplifying or reusing an existing mechanism. Judge additions by better accepted
outcomes relative to elapsed time, token use, runtime overhead, and maintenance cost; fewer commands
alone do not establish improvement. Test uncertain benefits with a small representative comparison,
and remove or revise an intervention when evidence or improved host/model capabilities makes it
unnecessary. This principle guides engineering judgment; it adds no approval form or reporting gate.
