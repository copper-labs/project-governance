# Compiled engine provider commands

This guide applies only to the compiled major-version engine. It does not change the wheel's
`harness-agent` contract. Use the adopting project's absolute
`.governance/runtime/bin/project-governance` launcher for every command below.

Read shared skill discovery with `skill-read --path catalog.yaml`. Read a referenced packaged file
with `skill-read --path <path-relative-to-skills-root>`, for example `test-execution/SKILL.md`.
The JSON response contains exact content and its digest, with a 64 KiB per-file limit. Use
`context-route` for required task guidance; catalog browsing does not replace that routing.
These commands read the selected package without recreating the wheel's physical skill directory.

When unrelated work is present, pass repeated `--changed-path <repository-relative-path>` arguments
to `context-route` for the current task's routing scope. At most 64 explicit paths are accepted.
The receipt records that selection. This selects guidance only: it does not narrow check selection,
change the captured Git subject, or certify that a planned path already exists.

Delegate only an assignment authorized by the parent. Preserve the operator's provider, model,
effort, scope and restrictions. Do not silently select another provider or global wrapper. Native
agents retain their own tools and authentication; workspace declarations are not a sandbox.

1. Run `provider-doctor --provider <claude|codex|gemini> --model <model> --effort <effort>` to
   inspect the binding. Optional `--config` and `--executable` select explicit local configuration.
   This does not test authentication or model availability.
2. Write a private JSON request file. Include `id`, `provider`, canonical `workspace`, `model`,
   `effort`, `prompt`, `deadlineMs`, `outputLimit`, and `assignment` containing `role`, `constraints`
   and `context`. Use `additionalRoots` for separately authorized directories, `requiredTools` for
   required observed tool names/categories, and `access` for `reader`, `writer`, or `exclusive`.
   Exclusive access is the default. Optional `idleTimeoutMs` bounds silence. Zero disables either
   timeout; cancellation remains available. Finite timeouts may not exceed seven days.
3. Run `provider-submit --request <request-file>`. By default the workspace and request ID
   select a stable private job directory. `--directory <new-private-job-directory>` overrides it.
   Reusing the same ID with different request contents is an identity conflict, not a new job.
   Retain the returned directory and request digest. Exit 0 means accepted submission, not completed
   work. An identical retry attaches to the same job; changed input requires a new job identity.
4. Use `provider-wait --directory <job> --digest <digest> --milliseconds 30000` for bounded waiting,
   or `provider-status` with the same directory/digest. Pending or unknown returns exit 2;
   completed success returns 0; other terminal results return 1. Never resubmit because observation
   timed out. `provider-events` accepts `--after <cursor>` and `--limit <count>` for public progress.
5. Inspect the returned completion and required proof. Truncated output names its full result
   artifact and digest. Provider completion does not establish parent acceptance or publication
   authority. Missing tools, denied input, failed checks and unknown cleanup remain unresolved.

Use `provider-list --workspace <root> --limit 100` to recover directory/digest handles for managed
jobs in that workspace. Listing is read-only, bounded and excludes prompt/answer contents. It reports
invalid entries and truncation; it is not a global inventory of explicit-directory or legacy jobs.

Cancel with `provider-cancel --directory <job> --digest <digest> --authority <parent-reference>`.
After confirmed cleanup, `provider-reconcile` with the same directory/digest releases retained
resource/runtime obligations. Missing cleanup is not permission to steal claims or restart work.

If the worker disappeared before publishing a result, use `provider-recover --directory <job>
--digest <request-digest> --authority <recovery-reference>`. Recovery requires a complete local launch
acknowledgment and successful process enumeration proving both the owner and its recorded process
group absent. It never signals a process or reruns the assignment. A live group, incomplete launch,
different host or unreadable process inventory stays unresolved. Successful recovery records an
**unknown execution outcome** with confirmed group cleanup, then reconciles the original resource
and runtime reservations. It does not qualify the assignment as successful or permit native-session
follow-up. Recovery locks left by interrupted recovery require investigation, not automatic removal.

Recovery also accepts an existing terminal receipt whose cleanup was unknown once the same absence
checks pass. It preserves that receipt byte for byte and appends separately bound cleanup evidence.
The command's `reconciliation` reports confirmed cleanup; the original `receipt` keeps its outcome,
exit code and original cleanup observation. Changed result or launch evidence invalidates the later
proof instead of silently replacing it. A failed or unknown assignment remains failed or unknown.

Native commands start a detached guardian before launch. If the worker disappears, the guardian
records group-member identities while a known member still belongs to the original group, and follows
observed parent/child relationships from matching known identities even across detached groups. It
terminates only matching recorded members, even if the original leader has exited, then uses the
same recovery and reconciliation path. It records an unknown execution outcome, never a successful
assignment. Missing launch evidence, no matching recorded member with surviving group members, inspection
failure, or a stopped guardian leaves cleanup unresolved. Normal completion also checks every
recorded child before confirming cleanup. Children that detach and disappear from the observed
parent tree before a scan are not covered; this is observed-process cleanup, not OS containment.

When both worker and guardian have stopped but recorded children remain, use
`provider-resume-cleanup --directory <job> --digest <request-digest> --authority <recovery-reference>`.
This starts cleanup supervision only, using the original request/runtime and recorded identities.
A live worker, reused guardian PID, changed runtime, or incomplete launch evidence refuses restart.
An already-running matching guardian is reused. Completed cleanup is reconciled without starting
another guardian. Interrupted restart locks require investigation; never remove them just to retry.

To continue a verified session, write a private JSON file containing new `id`, `prompt`, and
`directory` (omit it to use the managed workspace store), then call `provider-follow-up --directory <parent-job> --digest <parent-digest>
--request <follow-up-file>`. Model, effort, runtime identity, scope and restrictions remain bound
to the parent. A different assignment authority requires a new submission rather than an override.

Explicit wait/inspect works without host notification. On a queue-capable Codex host, submission may
add `--completion-executable <absolute-codex-path>`. It probes queue support and binds the initiating
`CODEX_THREAD_ID`, executable digest and Codex home before submission. Follow-ups retain that target.
Delivery sends only an evidence locator; it never sends provider output as instructions. `queued`
means the host accepted the notice, while consumption remains unknown. Inspect or attempt delivery
with `provider-deliver --directory <job> --digest <digest>`. Use `--retry` only after reconciling a
failed/uncertain attempt; duplication of a notice never authorizes rerunning the job. An orphaned
delivery lock remains uncertain and is not automatically stolen. Host restart survival and real queue
delivery require separate host qualification; fake-host tests do not establish them.
Do not bootstrap, update, publish, or change another project's installation from a delegated worker.
