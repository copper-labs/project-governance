---
name: test-execution
description: Select and execute necessary test proof cheaply, using direct checks or deterministic external batches. Use when planning or running substantial builds, test batches, or device qualification.
---

# Test Execution

Choose the cheapest reliable proof once per coherent batch. Keep the operator's Codex or Claude
session in charge. The project owns commands, assertions and device rules; the installed harness
owns execution and results. Do not weaken tests or delivery gates to save tokens.

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

From the current session, submit the request with the pinned executable:

```sh
.governance/runtime/bin/harness-agent batch --request-file /absolute/batch.json
.governance/runtime/bin/harness-agent wait JOB_ID --until-terminal
```

Keep the returned job ID. The second command observes the job without returning every heartbeat.
Use the host's supported wait/notification limits. Do not end the working turn just because tests
remain active. A detached process may still be killed by native host cleanup; claim survival only
where verified. Never wait for a child while holding a conflicting enclosing harness job claim.

For automatic assessment with no model alive during the batch, the operator can start the external
managed `cycle` command described in the contract. It uses the chosen provider and exact session;
it is not a way to spawn a competing agent or escape a restricted parent's permissions.

## Assess

Read `harness-agent result JOB_ID --summary`. Inspect every failed/not-run case, input validity and
cleanup before accepting proof. Open targeted full logs when needed; diagnose before rerunning.
Unknown cleanup keeps the resource claim. Recovery uses the same job; a lost observer is not authority
to duplicate it. A successful launch or a telemetry record does not prove a test passed.

## Light Usage Observation

External batches record use/results automatically. For direct, reuse, attended or bounded-fallback
choices, piggyback one `harness-agent record-use` on the existing batch command/closeout. Supply one
UUID decision ID, workspace, host and fixed choice/reason (`--help` lists them). No separate model
turn, event for each test, or repeated reporting after every skill read. Missing telemetry must
not block work. It measures reported use; it does not establish token savings or complete adoption.
