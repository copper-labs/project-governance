---
id: developer-guide.local-development
title: Local Development Without Duplicate Consent
type: guide
status: current
owner: project-governance
created: 2026-10-27
updated: 2026-10-27
summary: Uses existing checks and deliberate task-based workflow binding while retaining ownership and exact evidence.
---

# Local development without duplicate consent

Choose the smallest useful route. An isolated configured check uses the existing pack runner.
A shared build directory, device, service or multi-stage cleanup uses the workflow executor, which
owns its resource leases. A command name alone does not prove isolation.

Small changes need a clear outcome, the change and relevant verification. Structured plans help
coordinated work; they are not a new prerequisite for every diagnostic. Keep deliberately required
project contracts and Git hooks. Reuse valid proof and consolidate broader checks at useful boundaries.

## Deliberate adoption

After installing 4.4, an operator can choose this section in `config/governance/profile.yaml`:

```yaml
workflow_authorization:
  mode: task
  resources: []
  credential_env: []
```

List only the exact shared-resource IDs and credential environment names already authorized for
local work. Empty lists allow none. An agent must not expand the declaration to make a refusal pass.
This policy trusts mutable project code within the existing developer account. It does not provide
filesystem/network containment or prove that a human approved a particular file. Existing host
permissions, user restrictions and project custody controls remain necessary.

Absent configuration retains operator review. Invalid configuration refuses. Publication or package
installation alone never opts a project in. See the [owning contract](../../specs/engine-workflow-and-device-contract.md#configured-local-development-binding-44).

## Run and iterate

From the worktree root, use its repository-local runtime:

```sh
.governance/runtime/bin/project-governance workflow-bind --request request.json --receipt receipt.json
```

The request names the current `workspace`, `taskId`, `taskVersion`, `sessionId`, `recipeFile` and
stable `operationId`. The optional `runtimePackage` must match the invoked package. The recipe
uses the existing project operation catalog and exact current inputs. The returned receipt contains
the action and authority needed by `workflow-submit`; binding alone starts no work. Use the packaged
`test-execution` skill for submission, observation, cancellation and cleanup commands.

For a new run after driver, catalog or source edits, capture current inputs and use a new operation
ID and receipt. Task mode creates a fresh exact action without enrollment, renewal or another dialog.
Retrying the same request and receipt returns the original action when current policy still permits
that route. A narrowed policy can refuse replay; it does not revoke the already authorized action.
Preserve an operator receipt's original route when adopting task mode. It never repeats completed stages.
A current task revision can bind a successor after original work settles; it cannot revive old scope.

A refusal identifies an actual mismatch, stale task, unavailable owner or capability outside policy.
Correct that cause. Do not clear an uncertain receipt, release a live resource, remove a custody guard
or silently use another runner. Task-based binding preserves the executor's per-stage task checks,
process tracking, deadlines and cleanup rules.

## Withdraw and assess

Changing to `mode: operator` stops new policy bindings. It does not revoke already authorized work.
Withdraw the task or cancel the existing workflow through its current owner and verify cleanup.

Policy-based receipts record `task-policy`, a policy digest and binding time rather than a human
approval. Test success, physical-device proof and accepted development remain separate claims.
Fewer dialogs alone do not prove lower total cost or better outcomes.
