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
The active agent owns submission, waiting and assessment by default, for both Codex and Claude.
The operator does not need to execute terminal commands to use this skill. Test duration alone
does not select a separate provider lifecycle.
The [completion-return plan](../exec-plans/active/2026-09-10-test-completion-return.md)
records the replacement workflow and its acceptance boundaries.

## Commands

`harness-agent batch --request-file FILE` submits a version-1 JSON request. Existing status, result,
events, wait and cancel commands operate on its job ID. `wait --until-terminal` waits inside the
command without emitting intermediate events; terminating the observer does not cancel the job.
Host instructions still determine tool wait limits and whether detached jobs survive host exit.

`batch --notify-codex` binds the initiating `CODEX_THREAD_ID`, installed queue-capable executable
and Codex home before submission. `--codex-executable PATH` selects the executable when needed.
After durable terminal publication and cleanup, the worker/guardian queues one bounded trusted
message to that exact task. No provider job, model/effort override or operator command is involved.
The former `cycle` interface and its preparation/assessment implementation are removed.

Delivery has a separate private receipt: `sending`, `queued`, or `failed`. A per-job lock prevents
competing worker/recovery paths from delivering twice. `sending` is persisted before the native
call; a crash leaves an uncertain attempt rather than silently retrying. `deliver JOB_ID --retry`
allows deliberate recovery of failed/uncertain delivery without rerunning tests. A queued receipt
is never automatically resent and does not claim agent consumption. Result summaries expose it.
The native call is bounded and executable/home drift fails delivery. Test outcomes remain intact.
Status/recovery reads never dispatch notifications or wait on their lock. Worker/guardian dispatch
runs outside registry and completion locks. After loss of both supervisors, explicit `deliver`
from the initiating host recovers delivery; arbitrary observers cannot consume that attempt.
A separate deduplicated cleanup-attention notice prevents an unresolved resource claim from silently
stranding the task. The terminal notice follows only when cleanup is confirmed.

Claude uses its native Monitor tool around `wait JOB_ID --until-terminal`. Its one-line output
returns to the original interactive session. No separate observer agent, hooks or scheduled model
polling is required. Host capability and lifetime must be qualified before unattended use.

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

The initiating agent selects commands, submits once, and receives completion through Codex queue
or Claude Monitor. With a qualified return path it may end its model turn while the host stays
open. Keep exact job/result pointers and stable tested inputs. No supervising-model calls are
required while waiting; intentional product-model calls inside tests are a separate concern.

Qualification must prove return to the initiating session after its turn ends, plus failure,
timeout, cleanup and duplicate behavior. Queue acceptance alone does not prove consumption.
Closed hosts, restarts and remote sessions are not covered by a local open-host demonstration.
If the active host lacks a qualified return path, use supported bounded waits in the same task.
Do not turn that limitation into an operator terminal assignment or launch a competing agent.

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
