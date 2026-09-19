# Project Harness Charter

A runtime that makes work resumable, keeps actions within scope, and preserves evidence. Model
routing is an optional optimization that must stay removable.

## Focus

- The useful core is a portable record of what the operator wants, controlled execution, and
  evidence of what happened. The runtime is useful with **zero model calls**.
- Everything the runtime owns is one of four objects: Task, Action, Artifact, Evidence.
- The host keeps the reasoning and the pen. The harness reads, runs declared checks, and records.
- This repository consumes the governance runtime through its published CLI and JSON surface only.
  Anything further is an upstream contribution, never a fork or a vendored copy.

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
