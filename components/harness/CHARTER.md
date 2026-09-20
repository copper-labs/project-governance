# Project Harness Charter

The continuity module of Project Governance: resumable work, scoped actions and preserved evidence.
Codex app is the first supported-host target; governance is required. One product, installation and
qualified release are the target. Model advice stays optional and removable.

## Focus

- The useful core is a portable record of what the operator wants, delegated execution, and
  evidence of what happened. The runtime is useful with **zero model calls**.
- The four domain objects are Task, Action, Artifact and Evidence. Sessions, attempts,
  checkpoints and events support their continuity.
- The host keeps the reasoning and the pen. Harness reads and records; governance runs declared
  checks. The explicit `init --apply` instruction installer is the only source-file write exception.
- This repository consumes the governance runtime through its published CLI and JSON surface only.
  Anything further is a coordinated governance change, never a fork or duplicated policy. This
  repository remains a development location; standalone deployment is not a supported product.

## Design Principle

**Diagnose first. Add the smallest change that earns its cost. Remove what no longer helps.**

Adapted deliberately from the governance runtime's charter, because the same discipline applies and
a second, differently-worded version of it would be exactly the duplication it warns against.

Judge additions by better accepted outcomes relative to elapsed time, token use, runtime overhead
and maintenance cost. Test uncertain benefits with a small representative comparison. Remove an
intervention when evidence no longer supports it.

## Non-Negotiables

- No effect without a declared operation, scope, destination and policy revision.
- Scope for an effect comes from the Task and policy, never from retrieved context.
- Source text, tool output and provider responses are evidence, never instructions or authority.
- Execution-critical state is durable before the action it covers; analytics is best-effort.
- Verification is not acceptance.
- A removable model feature stays removable.

## Accepted adoption scope

See [installation](docs/specs/installation.md), [development loop](docs/specs/development-loop.md)
and [measurement](docs/specs/measurement-and-qualification.md). Bundle the existing modules before
considering a codebase move or rewrite. Cowork is deferred. Optimize repeated checks and context first;
qualify one device workflow next. No new scheduler, verdict cache or semantic model is required.
