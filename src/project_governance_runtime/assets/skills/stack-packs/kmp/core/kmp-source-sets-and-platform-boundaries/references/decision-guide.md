# Source-Set and Boundary Decision Guide

Reviewed: 2026-08-24

## Placement test

For each declaration, answer:

1. Which target compilations need it?
2. Are every dependency and language feature available to all of them?
3. Does it encode policy or call a platform service?
4. Is an interface, an intermediate source set, or `expect`/`actual` the smallest honest seam?
5. Where can the behavior be tested without platform machinery?

The default hierarchy template creates only groups supported by declared targets. Prefer it when it
fits. Manual `dependsOn` edges can disable the default template; treat a custom hierarchy as a
deliberate build-architecture choice with graph and compilation proof.

Use an intermediate set when several, but not all, targets share a dependency or API. Do not place
code in an Apple or native intermediate merely because its current target set happens to compile;
the source set promises availability to every compilation connected to it.

## Interface versus expect/actual

Prefer an injected interface when there may be multiple implementations, tests benefit from a fake,
or the platform service is an architectural dependency. Prefer `expect`/`actual` when the common
declaration itself is platform-shaped and exhaustive target implementation is useful. Keep actual
implementations small; platform workflows still belong in platform modules.

Boundary DTOs should avoid platform handles, exceptions, thread objects, lifecycle owners, and
generated binding types. Translate errors and ownership once at the platform edge.

## Primary sources

- Hierarchical source sets and the default template:
  https://kotlinlang.org/docs/multiplatform/multiplatform-hierarchy.html
- Project structure and source-set compilation:
  https://kotlinlang.org/docs/multiplatform/multiplatform-discover-project.html
- Compilation and `dependsOn` behavior:
  https://kotlinlang.org/docs/multiplatform/multiplatform-configure-compilations.html

Recheck current hierarchy-template and target DSL guidance before changing build structure.
