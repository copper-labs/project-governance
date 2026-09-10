---
id: spec.test-execution
title: Shared Test Execution
type: spec
status: current
owner: project-governance
created: 2026-09-10
updated: 2026-09-10
summary: Defines deterministic test batches, provider-preserving completion, and bounded usage observations.
---

# Shared Test Execution

Test Execution selects necessary proof and its cheapest reliable execution path. Quick checks run
directly. Long batches can use a deterministic job in the existing harness registry. The job owns
processes, workspace/output exclusion, deadlines and durable results; it never invokes a model.
Projects own test commands, assertions, input completeness and device management.
The [completed implementation plan](../exec-plans/completed/2026-09-10-shared-test-execution.md)
records the review reconciliation and acceptance boundaries.

## Commands

`harness-agent batch --request-file FILE` submits a version-1 JSON request. Existing status, result,
events, wait and cancel commands operate on its job ID. `wait --until-terminal` waits inside the
command without emitting intermediate events; terminating the observer does not cancel the job.
Host instructions still determine tool wait limits and whether detached jobs survive host exit.

`harness-agent cycle --workspace ROOT --provider codex|claude --model MODEL --effort EFFORT
--task-file FILE --authorized-full-access` starts an externally owned prepare/batch/assess cycle.
Existing `--config` provider bindings can supply model, effort and executable. This command uses
the existing full-access native adapters and requires explicit authority for them. It must start
outside the provider's managed tool tree. It does not change global settings or bypass a restricted
parent's authority. `--prepared-job ID` consumes a terminal harness preparation job without another
preparation call. A bare session ID is not accepted as a preparation job.

Preparation returns an answer containing JSON with `choice`, `note` and, for `external`, `batch`.
It may complete a quick direct check or reuse proof instead; those choices end the cycle without
another provider invocation. External preparation only selects commands; it does not start them.
The coordinator verifies successful preparation, exited provider/worker/guardian, exact binding,
and the request before starting the batch. Assessment uses the existing exact-session follow-up
with a deterministic idempotency key based on batch/result identity. A deduplicated failed or
cancelled assessment remains that attempt; it is never silently replaced.

The coordinator blocks on changed executable/configuration or unsafe/malformed results and retains
all evidence. Relevant configuration references are recorded as digests, never copied content.
Native model/effort/workspace/permission readback remains the provider adapter's responsibility.
Cancellation suppresses pending assessment and also cancels an already-created assessment job.
There is no automatic repair/retry loop, scheduler, daemon, or second session chosen by recency.

## Request

Requests are at most 256 KiB, with no unknown fields:

```json
{
  "version": 1,
  "workspace": "/absolute/project",
  "idempotency_key": "one-coherent-batch",
  "timeout_seconds": 600,
  "inputs": {"mode": "declared-roots", "roots": ["/absolute/project"]},
  "output_roots": [],
  "cleanup_required": false,
  "host": "codex",
  "cases": [
    {"id": "focused", "argv": ["/absolute/python", "-m", "pytest", "tests/focused.py"],
     "timeout_seconds": 300, "expected_exit_codes": [0], "depends_on": []}
  ]
}
```

Workspace, input roots and optional output roots are existing absolute directories. Argument arrays
name one resolved executable, whose bytes are bound at submission and checked before launch.
They prevent interpolation by this runtime, not arbitrary execution by an authorized shell/script.
No command becomes authorized merely by appearing in model output. The invoking operator/agent
must have authority for the requested commands and resource scope.

There are 1–100 sequential cases. IDs are unique, simple identifiers; dependencies may reference
earlier cases only. Every case explicitly declares accepted exit codes and a positive total deadline.
That declaration is the project's native test assertion contract; the harness launcher exit alone
never proves a test passed. Optional `result_receipt: true` additionally requires a fresh JSON receipt
in the case's private directory with its batch ID, case ID, and `outcome: passed|failed|blocked`.
Unexpected exit or invalid receipt fails the case. Expected negative exit codes are recorded intact.
Failed dependencies are not run; unrelated cases can continue after ordinary assertions. Timeout,
infrastructure failure, input drift or uncertain cleanup stops the remaining work.

The overall deadline includes admission. Case time covers the canonical command's build/install/test
and evidence work; bounded process termination follows expiry. An estimate is not a deadline.
The project runner may enforce finer internal deadlines without creating another harness scheduler.

## Inputs And Resources

Declared roots identify a limited scope under cooperating exclusive ownership. They do not certify
complete dependencies or detect every outside writer. Optional `manifest` inputs additionally supply
`files: [{path, sha256}]`; every absolute file lies under a declared root. The runtime binds membership,
checks bytes before and after execution, and rejects drift. The project must include relevant untracked,
configuration, fixture, toolchain and built inputs when making those claims. Before/after hashes cannot
detect edit-and-restore; staged bytes are not working-tree proof. Stronger acceptance needs project-owned
immutable inputs or coordination with every known writer. Neither mode certifies completeness by itself.

Workspace and input/output roots share the existing registry's exclusive claims through cleanup.
Duplicate keys reuse the same request/job; different request bytes fail. A new key cannot bypass an
overlapping claim. Idempotency is not validation of old evidence. A conflicting enclosing harness job
must prepare for execution after it exits; it cannot wait for a child while holding that child's claim.

Device locks and shared services remain project-owned. A canonical batch runner must acquire the
existing device lock before use and release it only after verified cleanup. Set `cleanup_required`
for such resources. It must write `resource-cleanup.json` in the private batch directory with `batch_id` and
`cleanup_confirmed: true` only after releasing its resources. This acknowledgment does not replace the
project's lock. Missing or malformed acknowledgment retains the runtime claim, including after worker
death. An authorized recovery runner can finish cleanup and write the same receipt; the guardian or
status recovery then publishes completion. Never manufacture an acknowledgment to clear a stale claim.
The acknowledgment must exist after the last executed case: every case start invalidates the earlier
receipt, including a later reporting case that uses no device.

Live batches and unconfirmed cleanup use protocol 2 to block older harness recovery code. After
confirmed cleanup, request and result records return to protocol 1 before terminal status is published
last. A crash before that last write retains the guard until the current runner completes recovery.
Older executables sharing the store are blocked only during live or unresolved batch ownership.

Commands receive `HARNESS_BATCH_ID`, `HARNESS_BATCH_DIR`, `HARNESS_CASE_ID`, and `HARNESS_CASE_DIR`.
Logs and optional `result.json` receipts use those new private directories. They never reuse a prior
batch's evidence destination. Preserve partial outcomes and not-run cases after crashes. Ordinary
process identity/guardian recovery remains shared with provider jobs; uncertain cleanup is not success.

## Host Integration And Evidence

The current-session route uses one batch and the host's cheapest supported wait/notification. A host
may terminate detached descendants even after setsid; survival requires actual host proof. Bounded
model-driven waits are not a zero-call guarantee. Keep the active turn when work remains unless the
operator hands it off or the host interrupts it. Preserve exact job/result pointers on interruption.

The managed cycle supplies the stronger interval: preparation processes are gone before tests start,
and assessment starts after durable results and cleanup. Preserve their timestamps and process records.
There are no supervising-model calls in that interval. This does not ban intentional product-model calls
inside project tests. Native desktop/IDE automatic return is unverified unless separately demonstrated.

Result summaries preserve all case identities and point to full private records; they do not replay
logs. Check failures, input validity and cleanup before accepting evidence or choosing repairs.

## Skill Routing And Telemetry

The installed `test-execution` skill is reached through one sentence in the existing managed host block,
Plan/Work/Review routes, exact skill ID and narrow task terms. Installation must preserve authored host
instructions and override/symlink semantics. Doctor reports local capability only. Changing this block
is an integration change and requires deliberate adoption of the feature release.

The existing bounded local telemetry accepts two content-free event families: a reported skill decision
and an observed batch terminal result. Fixed enums identify host/choice/reason; opaque IDs correlate
records. Outcomes, elapsed duration and available aggregate token usage remain advisory. No prompts,
commands, paths, native session IDs, model configuration or job output enter telemetry. Known native
token totals are reused; missing measurements remain unknown. No transcript scanning or model calls.

Once per coherent decision, `harness-agent record-use --workspace ROOT --decision-id UUID --choice
direct|reuse|external|attended|bounded-fallback --host codex|claude|unknown --reason REASON` can be
piggybacked on an existing command/closeout. Batch submission records external use automatically.
Telemetry never adds a per-test ceremony. Duplicate aggregation, concurrency-safe retention, 1,000-record
and one-mebibyte limits, fail-open writes and the existing on-demand status view remain shared.
Unreported use and aged-out events are unknown; counts are not causal proof of token savings.
