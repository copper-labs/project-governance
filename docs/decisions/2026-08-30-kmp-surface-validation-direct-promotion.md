---
id: decision.kmp-surface-validation-direct-promotion
title: KMP Surface Validation Direct Promotion
type: decision
status: approved
owner: project-governance
created: 2026-08-30
updated: 2026-08-30
summary: Admits KMP Surface Validation directly into the shared runtime as a disabled-by-default strategic capability.
---

# KMP Surface Validation Direct Promotion

Promote KMP Surface Validation directly into the shared runtime without waiting for demonstrated
reuse by a second adopter and without an adopter-incubation phase.

This is an explicit strategic exception based on commitment to KMP as a supported platform
architecture. It is not evidence that the contract has already proved generic reuse.

The exception is bounded:

- installation leaves the capability disabled;
- no catalog, graph, pack, hook, or adopter configuration is generated;
- activation requires one deliberate adopter-owned pack;
- the wheel retains no adopter identities, product paths, graph instances, or evidence; and
- release and adopter upgrades remain separate operator decisions.

The shared implementation may proceed once the specification and conformance contract are approved.
Future adopter experience may simplify or extend the capability through the normal specification and
release process; it does not retroactively supply the second-consumer evidence waived by this
decision.
