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

Normal development stays with one coding agent on its fixed host model. Use these provider commands
only when the operator requests a second agent or a project-owned required review calls for one.
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

## Task context and optional category routing

Keep the coding model fixed by default. Supply the complete fixed pair in an explicit provider
`config`, or preserve an explicit operator selection. Do not select a model from an old Markdown
table. Optional category routing uses DL08 and an operator-defined category map; it never permits
new delegation, different tools or extra jobs.

Bind a task once with `harness task create --outcome <goal> --scope <path>` or `harness resume --task <id>`
under the host's inherited `HARNESS_SESSION` or `CODEX_THREAD_ID`. New ordinary provider submissions
resolve that binding automatically. An explicit `decision` object `{version:1, workspace, taskId,
revision, requirement, acceptance, sourcePaths}` or `GOVERNANCE_DECISION_CONTEXT` file takes precedence.
Guarded admission still requires its explicitly authorized decision object; an ambient binding grants
no delegation or model-routing authority. Replay retains the job's original task, including no task.

The normal submit path prepares required instructions and bounded optional context before native stdin.
JEV only sees approved sources; explicitly supplied provider sources retain deterministic delivery when
sharing or credentials are absent. Missing binding is recorded as unavailable and cannot count as a
successful JEV exposure. Provider completion records native status separately from optional quality advice.
The trusted host sets `dataDestination: local-only` when the assignment forbids cloud processing.
Current native adapters then refuse before context selection or provider launch; RC4 has no qualified
local generation backend. Omission retains the existing authorized cloud path, or the host may state
`cloud-allowed` explicitly. Free-form prompt text cannot substitute for this bound restriction.

The first routable worker is a read-only Claude `bounded-summary` assignment. A trusted host calls
`authorizeProviderAssignment` from `host/v1`, and the request carries its `admission` reference.
Authority, model configuration, executable and registry stay outside all worker roots. Use an
explicit protected job directory directly beneath the admission directory. The restricted worker
has read/search tools and native structured output, with shell, writes and delegation unavailable.
The unrestricted coordinator remains outside that claim.

`provider-doctor --request <file> --directory <job>` inspects admission, legacy policy and existing
native qualification without provider calls. It reports baseline-only when optional qualification
is missing. `continuity.model_routing.providers.claude.require_governed_entry: true` separately
requires this path even with routing off. Enabling DL08 shadow/advice does not itself prohibit
legacy explicit submissions outside that required pilot.

Live category selection requires both DL08 `mode: auto` and `effect: route-model`, under the global
mode ceiling. Each category has one description and exact model/effort pair. Qualification uses
successful native jobs under the same protected directory, host, roots and required tools; it
expires after 24 hours or a later matching failure. Uncertainty, missing tokens or unqualified
choices retain the fixed pair. A changed authority at detached dispatch refuses the job before a
native child starts; it does not retry through another model or entry.

Preserve project-owned `config/governance/model-selection.md`. The trusted host must attest its
exact reviewed digest before activating category routing. Explicit reviewer overrides may name
only a model or only an effort; the fixed configuration supplies the other value. They do not
activate JEV selection. A guarded follow-up needs `authorizeProviderContinuation` for the same
requirement and includes that new `admission` reference in its follow-up JSON. A changed requirement
needs a new assignment; no self-issued continuation or retry cascade is allowed.

Normal checks and Git children resolve the same task automatically. Explicit `--decision-context <file>`
and `GOVERNANCE_DECISION_CONTEXT` remain available. Detached checks freeze intent at submission;
`--decision-purpose` can add check focus without replacing it. `check-output --run <id>` selects optional log
content; `check-status --run <id>` returns compact terminal evidence and `--full` retrieves the full
projection. Required failures, status, cleanup and original artifact references remain visible.
`check-reconcile --run <id>` recovers only verified terminal ownership; it never reruns a check.
`plan --compare-run <id>` compares advice with existing matching native results without executing
extra checks. Smaller delivery is an observation, not evidence of accepted-work savings.

## Generic workflow command recovery

For a workflow stage command with lost supervision, use the managed runtime's
`command-resume-cleanup --directory <original-command-directory> --digest <request-digest> --authority <authority>`.
It resumes cleanup only and refuses while the original command worker is alive. It never reruns the assignment.
`command-recover` with the same flags records independent absence evidence after all owned processes have gone.
`command-reconcile --directory <original-command-directory> --digest <request-digest>` binds the existing cleanup
evidence. These are write operations. A lost command outcome stays unknown in its original receipt;
workflow verification fails even when cleanup is confirmed. Read stage evidence before interpreting a failed run.
