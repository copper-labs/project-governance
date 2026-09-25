# Compiled runtime startup

Use the absolute repository-local `.governance/runtime/bin/project-governance` for every command
below. The launcher supplies workspace and installation-registry scope. This guide does not authorize
publication, major upgrades, edits to host trust, or changing the repository's update policy.

Children inherit the parent runtime. They never discover, assess, apply or recover startup updates.
A top-level task keeps its current runtime unless tracked `runtime_updates.policy: compatible`
and the runtime's native-parent, release and worktree checks permit a compatible update.

## Observe and assess

Configured Codex hooks observe initial startup, continuation and close events. Only initial startup
can discover a release. Do not synthesize a startup event or rerun discovery because the hook output
is quiet. Cached discovery, prerelease or local-archive locks, manual policy, no update and routine
continuation are normally quiet. The default release-metadata refresh interval is 24 hours.

Use the task identity supplied by the hook and the receipt-store path configured in that hook:

```sh
project-governance startup status --task <task> --receipts <receipt-store>
project-governance startup assess --task <task> --receipts <receipt-store> --work-state <state> --reason '<brief assessment>'
```

Choose `not-started`, `minor`, `substantial-plan`, `review` or `read-only` truthfully. Substantial work,
review and read-only tasks retain their runtime. An available candidate alone is not authorization.
If assessment permits preparation, use one new canonical external operation directory:

```sh
project-governance startup apply --task <task> --receipts <receipt-store> --work-state <state> --reason '<brief assessment>' --operation-directory <directory>
```

`startup prepare` accepts the same arguments when inactive staging alone is wanted. Apply preserves
unrelated Git changes, uses normal commit hooks/signing, and commits only the verified runtime lock.
Keep the operation directory and returned evidence. Reusing the same operation observes its state;
it does not renew the installation deadline or authorize a second command.

## Recovery

If an operation needs recovery, inspect its retained evidence and process cleanup before continuing.
Never delete a lock, steal ownership, infer success from a timeout or launch another update attempt.

- Before activation and before any commit dispatch, `startup cancel-update --operation-directory <directory> --receipts <receipt-store>` releases the exact stopped attempt.
- After activation but before writes, `startup restore-update` with those arguments can restore the backed runtime when its identity and cleanup checks pass.
- After a confirmed exact lock commit, `startup recover-update` also requires `--command-digest <original-command-digest>` and completes bookkeeping without repeating the commit.
- After writes, `startup retry-update` with the directory, receipts and original command digest permits one explicit retry of an unchanged valid candidate's failed commit. A broken candidate requires deliberate runtime repair; commit retry is not repair.

An unresolved result remains unresolved. These recovery commands never substitute for required proof.

For an abandoned short hook reader, use `startup recover-observation --observation-token <token>
--authority <reason> --receipts <absolute-store>`. Recovery checks the recorded local host and
workspace and requires the hook PID to be absent. A live or reused PID prevents release. It releases
only that reader; the parent task reservation remains unchanged. Missing ownership does not prove
that discovery succeeded. Retain the command output with the incident evidence. Legacy readers
without process identity require separate investigation; this command does not infer their owner.

## Install observers deliberately

`startup hooks --receipts <absolute-store>` proposes project-local configuration without writes.
`startup install-hooks` with the same argument installs it while preserving authored handlers.
Legacy or customized handlers require deliberate reconciliation. Neither command enables compatible
updates, changes global Codex configuration, or trusts hooks. Ensure hooks are enabled, the project is
trusted, and the exact definitions have been reviewed through Codex `/hooks`; managed policy may
prevent project hooks. File installation alone does not prove native event delivery.

For an existing wheel installation with shipped legacy hooks, use the coordinated runtime update,
not `startup install-hooks`. Its explicit request includes `startupReceipts: <absolute-store>` and the
saved project/host migration plans. The verified backup and drained transition own replacement;
customized or incomplete legacy sets require reconciliation. New hook definitions still need native
trust review after migration. Do not remove the old launcher or receipt history before qualification.
