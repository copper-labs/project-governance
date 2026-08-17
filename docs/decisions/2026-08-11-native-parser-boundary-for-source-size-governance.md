---
id: decision.native-parser-boundary
title: Native Parser Boundary For Source-Size Governance
type: decision
status: current
owner: project-governance
created: 2026-08-11
updated: 2026-08-11
summary: Keeps the universal size rule simple and confines optional declaration detail to maintained language tooling.
---

# Native Parser Boundary For Source-Size Governance

The universal maintainability rule measures physical file length and requests review when a file
exceeds 500 lines. It does not need to understand a programming language.

Optional declaration-level detail is supplied only by a maintained tool from that language
ecosystem: TypeScript compiler APIs for TypeScript and TSX, Swift compiler tooling for Swift,
Kotlin compiler tooling for Kotlin, and ShellCheck for shell. Python uses its standard AST.

Do not add a universal handwritten parser, background service, scheduler, or cache to make this
policy work. Missing optional detail is reported separately from invalid source; it does not change
the physical-file result.
