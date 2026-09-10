# External Test Batch Contract

Use the pinned `.governance/runtime/bin/harness-agent`. Ordinary governance checks never launch a
model. `batch` has no provider process; `cycle` optionally uses native provider jobs around it.

## Request Format

Write a version-1 JSON request, at most 256 KiB. This example declares a native assertion contract;
replace its canonical command and project paths with the existing project runner's actual values.

```json
{
  "version": 1,
  "workspace": "/absolute/project",
  "idempotency_key": "unique-coherent-batch",
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

Every case declares a positive deadline and accepted native exit codes. There are 1–100 ordered
cases; dependencies name earlier cases. Unexpected assertion failures block dependents but allow
independent cases. Timeout, infrastructure failure or input drift stops the remaining work. Use
one canonical project batch runner when it already owns a device/test matrix; do not duplicate it.

Optional `result_receipt: true` requires the project command to write `result.json` in
`HARNESS_CASE_DIR`, with `batch_id`, `case_id` and `outcome: passed|failed|blocked`. The runtime supplies
`HARNESS_BATCH_ID`, `HARNESS_BATCH_DIR`, `HARNESS_CASE_ID` and `HARNESS_CASE_DIR`. Logs use fresh private
directories. Do not infer a pass from the launcher itself or reuse a stale result destination.

Declared roots are limited evidence under cooperating exclusive ownership. Optional `inputs.mode:
manifest` adds `files: [{"path": "/absolute/input", "sha256": "64-lowercase-hex"}]`. Files lie inside
declared roots and are checked before/after execution. Neither declaration certifies completeness;
project assertions need relevant untracked/configuration/toolchain/compiled inputs. Hashes cannot
detect edit-and-restore. Do not certify current-candidate proof when input stability is uncertain.

Workspace/input/output roots are existing absolute directories with shared harness exclusion.
Idempotency reuses one unchanged request, not old evidence after source changes. A conflicting
enclosing job must exit before this batch can start; prepare the request and hand it back instead.

## Project Resource Cleanup

Device runners retain their existing device-lock authority. Use `cleanup_required: true` when
process exit alone does not establish cleanup. The authorized runner must write `resource-cleanup.json` in
`HARNESS_BATCH_DIR` with its exact `batch_id` and `cleanup_confirmed: true` after verified resource
cleanup/release. Missing or invalid acknowledgment retains ownership, including after worker death.
An authorized project recovery runner can complete cleanup and publish that acknowledgment; the
existing guardian/status recovery then closes the job. Never forge a receipt to unblock a device.
Each case start invalidates the previous acknowledgment, so it must be present after the last
executed case, including a later reporting case that does not use the device.

## Managed Codex Or Claude Cycle

The operator starts this outside either native provider's tool tree:

```sh
.governance/runtime/bin/harness-agent cycle --workspace /absolute/project \
  --provider codex --config /absolute/provider-binding.json \
  --task-file /absolute/testing-task.txt --authorized-full-access
```

Use `--provider claude` for Claude. The existing configuration format is
`{"version":1,"providers":{"codex":{"model":"chosen-id","effort":"high"}}}`. Choose the operator's
actual model/effort; no defaults or fallbacks are invented. Existing native adapters use full access;
the flag confirms existing authority, not permission to expand a restricted task. Normal project
instructions and hooks remain active. `--config-input FILE` binds additional relevant host settings.

Preparation may finish quick direct/reuse work without another invocation. For long work it returns
the batch request and exits. The coordinator runs that batch with no provider alive, then performs
one exact-session assessment. `cycle --prepared-job ID --authorized-full-access` recovers a terminal
harness preparation job without preparing again; a raw interactive session ID is insufficient.
Changed settings/executable, missing auth, uncertain evidence or cancellation blocks continuation.
Inspect existing results without rerunning tests. Assessment does not automatically repair/retry.

Claude interactive background notification can be used when verified, but exit/task-stop may kill
detached descendants. Codex bounded waits may still return to its model. These are not equivalent
to the managed cycle's model-free interval. Desktop/IDE automatic return needs its own proven adapter.
