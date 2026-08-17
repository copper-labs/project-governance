---
id: governance.validation-strategy
title: Validation Strategy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-16
summary: Defines focused, impact-aware validation for the package runtime and its adopters.
---

# Validation Strategy

Validation should prove the change just made. It should not repeatedly run unrelated checks merely
because they exist.

## Normal Change Loop

1. Change one owning component.
2. Run its focused unit or behavior test.
3. Run the one affected integration seam.
4. Commit the coherent result.

For a failed governance check, rerun only the failed pack:

```sh
project-governance check --pack <pack-id>
```

After it passes, run one closeout:

```sh
project-governance check --stage pre-commit --mode impacted
```

## Selection Rules

| Input change | Selected work |
| --- | --- |
| Applicable source file | Formatting, naming, maintainability, comments, test quality, and target-owned packs for that path |
| Governed documentation | Documentation governance |
| Context routes, agent catalog, or root instructions | Context routing |
| Runtime lock, bootstrap, hooks, profile, facts, or extension registration | Installation validation |
| Telemetry implementation or telemetry policy | Telemetry verification |
| Agent contract, routing, dispatch state, or native profile catalog | Agent contract plus synthetic native-host routing |
| Pack definitions, schemas, selectors, or extension registration | Validation conformance |
| Source file at commit time | Secret detection for changed files |

An unmapped path fails with one selector finding. It never causes all packs to run. Project build
systems retain responsibility for compilation, test caching, and device evidence.

Change-sensitive packs consume one runtime-resolved packet. Comment enforcement is full for new
files and new public or authority-boundary declarations; an existing declaration is reopened only
when its header or signature changes. Dependency freshness evaluates only coordinates added or
updated between the packet's before- and after-images. Existing comment debt and unchanged
dependency tuples do not become implementation scope.

Pre-commit secret proof deliberately includes bytes present only in the staged index. Pre-push,
pre-PR, CI-PR, and release retain their declared live publishable worktree-and-index secret
surfaces and report no pack digest. This difference is an explicit stage contract, not an
inconsistency to normalize away.

## V1.1 Proof Rules

The completed V1.1 evidence-integrity plan's focused proof establishes:

- changed/staged checkers cannot substitute checkout bytes for packet materializations, while
  explicit all mode can read the checkout across declared scope;
- canonical `subject_digest` identity survives temporary-path changes and detects subject or
  materialization mismatch;
- process failure blocks even when child output claims an accepted, waived, or suppressed finding;
- a passed result may retain nonempty accepted, waived, or suppressed findings and exact numeric
  counts;
- lexical test-quality findings are advisory, while detector and process infrastructure failures
  block;
- a secret waiver matches one stable detector ID, path, after-image SHA256, owner, rationale, and
  expiry without exposing the secret;
- an optional evidence manifest is bounded, binds the immutable subject, rejects ambiguous input,
  and never resolves an artifact path or reads artifact content; no checkpoint or cross-pack
  composition behavior exists; and
- wheel inspection rejects concrete adopter/product identities and explicit model-invocation
  instructions without banning generic documentation vocabulary.

## Broad Proof

Run the complete suite only for a runtime release, a configuration-schema migration, a hook or
selection-contract change, a security/process-isolation boundary, scheduled reconciliation, or an
explicit operator request.

Provider-aware orchestration changes prove the pure routing table, command-entry clock, explicit
start/finish lifecycle, writer lease, fail-solo behavior, terminal receipt sanitization, and both
native catalogs before broad proof. Tests use synthetic catalogs and launch entries; they never
call Codex or Claude.

## Evidence

Report the focused test, affected seam, selected packs, any intentionally omitted proof, and
residual risk. The JSON result contains normalized findings, status, execution duration, and
termination reason. Bounded local telemetry adds changed-path, selected-pack, executed-command,
and per-pack duration/count aggregates without retaining paths, commands, output, prompts, or
source content.
