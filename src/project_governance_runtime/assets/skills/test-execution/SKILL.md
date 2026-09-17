---
name: test-execution
description: Select and execute necessary test proof cheaply, using direct checks or deterministic external batches. Use when planning or running substantial builds, test batches, or device qualification.
---

# Test Execution

Choose the cheapest reliable proof once per coherent batch. Keep the operator's Codex or Claude
session in charge. The project owns commands, assertions and device rules; the installed harness
owns execution and results. Do not weaken tests or delivery gates to save tokens.

The active agent executes the commands below, waits and assesses the results. Ordinary test work
does not require the operator to run a terminal command or start a separate provider session.

## Select

- Reuse evidence only when its inputs and claim remain valid.
- Run quick focused checks directly. Do not add a preparation/assessment pair to a tiny test.
- Prefer a deterministic external batch for long work when the host and runner support safe ownership.
  Useful independent work may make a direct completion-aware wait cheaper.
- Stop at human/device/credential interaction. Unsafe cleanup or unsupported detachment uses the
  existing bounded wait; do not repeatedly retry or silently choose another device/provider.

Record the choice and short reason in the existing proof budget. Read
`.governance/runtime/skills/resources/test-batch-contract.md` only for external execution or recovery.
Use `.governance/runtime/skills/resources/efficient-execution.md` for waiting/output details.

## Prepare And Execute

Use the project's canonical commands and accepted exit/result contracts. Group a coherent batch;
declare inputs, output claims, expected negatives, dependencies and deadlines. Project device runners
keep their existing locks and cleanup acknowledgments. A Git HEAD alone does not identify test inputs.

For a batch, write the request and use the current host's completion path:

- **Codex:** invoke `.governance/runtime/bin/harness-agent batch --request-file /absolute/batch.json
  --notify-codex`. This binds `CODEX_THREAD_ID` and queues completion back to this task. Supply
  `--codex-executable /absolute/codex` if the host's CLI is not on PATH. Keep the job ID, then do
  independent work or end the turn while awaiting the completion message. Do not poll for status.
- **Claude:** submit the same batch without `--notify-codex`, then use the native **Monitor** tool
  to run `.governance/runtime/bin/harness-agent wait JOB_ID --until-terminal`. It emits one JSON
  line at completion (or when cleanup needs attention). Keep the interactive session open; do
  independent work or end the turn and let Monitor deliver the event. Do not launch `claude -p`.
- **Unsupported host:** use the supported bounded wait in the same turn and state the limitation.
  Do not substitute operator terminal work, a custom launcher, or another provider session.

A model turn can end while its host session remains open. Closing the host or stopping its task can
terminate owned processes; do not claim survival across exit/restart without proof. Never wait for
a child while holding a conflicting enclosing harness job claim. Keep tested inputs stable while
working independently. Preserve the operator's provider/model/effort; this path selects none.

## Assess

Read `harness-agent result JOB_ID --summary`. Inspect every failed/not-run case, input validity and
cleanup before accepting proof. Open targeted full logs when needed; diagnose before rerunning.
Unknown cleanup keeps the resource claim and emits one attention notice. Recovery uses the same job; a lost observer is not authority
to duplicate it. `harness-agent deliver JOB_ID` shows the recorded Codex delivery attempt; use
`--retry` only after reconciling failed/uncertain delivery, without rerunning tests. Queued means
accepted by the host, not already read by the agent. A successful launch or a telemetry record does not prove a test passed.

## Light Usage Observation

External batches record use/results automatically. For direct, reuse, attended or bounded-fallback
choices, piggyback one `harness-agent record-use` on the existing batch command/closeout. Supply one
UUID decision ID, workspace, host and fixed choice/reason (`--help` lists them). No separate model
turn, event for each test, or repeated reporting after every skill read. Missing telemetry must
not block work. It measures reported use; it does not establish token savings or complete adoption.
