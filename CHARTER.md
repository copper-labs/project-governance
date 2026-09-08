# Project Governance Charter

`project-governance` provides a lean, reusable Python runtime for governance checks. It is not a
project instance and contains no product-specific policy or operational data.

## Focus

- Markdown is the active authority for governance decisions, plans, and documentation.
- The standard wheel contains only generic runtime behavior, generic checks, schemas, and shared
  skills.
- A project owns its profile, facts, extension packs, documentation, and thin integration files.
- Projects pin an exact wheel. Adoption is deliberate unless a tracked opt-in authorizes a
  compatible update at top-level task startup; source changes never alter another project's lock.
- Narrow checks are the normal loop. Broad proof is reserved for shared boundaries and explicit
  reconciliation.

## Design Principle

**Diagnose first. Add the smallest change that earns its cost. Remove what no longer helps.**

Start with an observed failure and its cause before proposing another control, abstraction, or
workflow. Prefer simplifying or reusing an existing mechanism. Judge additions by better accepted
outcomes relative to elapsed time, token use, runtime overhead, and maintenance cost; fewer commands
alone do not establish improvement. Test uncertain benefits with a small representative comparison,
and remove or revise an intervention when evidence or improved host/model capabilities makes it
unnecessary. This principle guides engineering judgment; it adds no approval form or reporting gate.
