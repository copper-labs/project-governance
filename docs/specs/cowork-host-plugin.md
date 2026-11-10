---
id: spec.cowork-host-plugin
title: Cowork access to the native Governance runtime
type: spec
status: approved
owner: project-governance
created: 2026-11-10
updated: 2026-11-10
summary: Provide a distributable Cowork plugin that uses each registered Mac project’s existing Governance runtime and evidence.
---

# Cowork access to Governance

## Problem and intended behavior

Cowork’s shell cannot execute a project launcher whose Node binary and runtime registry live on the
Mac. A user must be able to perform ordinary governed development entirely from Cowork: identify a
project, create or resume work, retrieve useful context, edit the actual candidate, run checks, read
their results, and make a local commit through the normal hooks.

Ship a thin local MCP plugin with Governance. MCP is the tool connection between Cowork and the Mac.
Keep the native runtime as the sole owner of tasks, checks, execution, resources and evidence.
The same published plugin must work for teammates with different usernames, project locations and
Node installations. No Codex plugin is part of this release.

## Ownership and boundaries

The plugin is maintained in this repository and built into a separate release asset. It must not
contain a copied Governance implementation or choose an unpinned runtime. Project registration is a
local installation action, not a model-callable grant. Store only the machine-local mapping needed
to reach an existing registered project. Never distribute that mapping, credentials or project data.

Resolve each call through the existing generation coordinator and verify the project lock. Avoid
executing a model-editable launcher as unchecked code: registration must retain trusted invocation
parameters outside the project, or validate the exact registered launcher before every invocation.
A legitimate runtime update must have a documented supported refresh path. No model-selected executable,
registry, environment, arbitrary argv, shell string or external filesystem path is accepted.

One registration grants access to the selected development project. Explain once during setup that
native checks and Git hooks execute project-authored code on the Mac, and that returned project text
and check excerpts enter Claude. Do not add a Governance dialog for every workflow. Claude’s own
permission controls remain in effect. Existing provider and credential disclosure permissions do not
expand. Registration does not grant access to other projects or authorize deployment or publication.

The adapter uses an honest Cowork session identity, never a fabricated Codex thread. A model-carried
resume handle is a continuation reference, not proof of a person’s identity or permission. Task scope
and revision checks remain with the native runtime. A reconnect must retain access to durable run
results without inventing success or restarting work.

## Tool contract

Expose separate typed operations so read-only calls cannot carry hidden mutation choices.

| Tools | Purpose and owning operation |
| --- | --- |
| `governance_projects` | List valid registrations and individual setup problems; runtime readiness is checked on invocation. |
| `governance_task_start`, `governance_task_resume`, `governance_task_show`, `governance_task_checkpoint` | Create, resume, inspect and checkpoint native tasks. Task status exposes valid evidence IDs; check run IDs belong in checkpoint prose, not its evidence-ID array. |
| `governance_context`, `governance_skill_read` | Retrieve focused native context or a selected skill. |
| `governance_file_read`, `governance_file_apply` | Read or edit native files with original hashes and task-scope checks. |
| `governance_check_start`, `governance_check_status`, `governance_check_output`, `governance_check_cancel` | Use the native detached check owner and retained run identity. |
| `governance_commit`, `governance_commit_status` | Commit selected whole files through normal hooks, then inspect durable results and bounded hook output. |

No generic command execution, provider calls beyond existing native decision settings, runtime upgrades, device actions, reservation
release or remote publication tool is added. These exclusions do not authorize bypassing existing
checks that govern a selected local commit. Required project checks may themselves need unavailable
prerequisites; report their native blocker honestly.

## Candidate integrity and concurrent work

Every file operation is relative to one registered project. Reject traversal, symlink escapes,
Git internals, runtime payloads and secret/configuration areas outside the explicitly registered
editable scope. Bounded reads return hashes. Writes require the original hash (or explicit absence)
and must refuse changed originals without overwriting. Do not add a general synchronization daemon.

Use the native file tool for project edits in this release, whether Cowork exposes a live mount or a copy. Before a check or commit,
compare the supplied expected changes with the host candidate. Missing, changed or unexpected scoped
changes cannot be called verified. Keep the native validation subject and its receipt authoritative;
never label a result as checking a sandbox copy solely because paths look similar. Later edits make
previous evidence historical. Preserve the original result and report freshness separately.

A commit must not sweep in unrelated staged work, lose the prior index, or race an active index
writer. Use an existing safe commit mechanism where applicable. Refuse an unresolved index/ownership
conflict with a useful explanation instead of resetting or bypassing hooks. Commit success returns
its actual object ID; a passing check alone does not establish a commit. A clean rejection with
confirmed cleanup and unchanged HEAD/index is `not-committed`, with retained intent-to-add entries
reported. It can be corrected and resubmitted. An uncertain outcome is `recovery-required`; status
may identify the original immutable commit but does not claim preservation without proof. Concurrent
unrelated worktree edits are reported separately from verified commit and unrelated-index integrity.
Unrelated large or nonregular entries receive metadata-only observations, not content-verification claims.

## Failure and lifecycle behavior

Unknown project, unavailable Mac host, incompatible runtime, moved checkout, altered trusted entry,
stale file expectation and malformed arguments produce actionable failures before effects.
Use the existing detached check worker, run ID and cancellation receipt. A disconnected MCP client
must not kill or orphan an otherwise healthy native job. Polling cancellation is distinct from
explicit check cancellation. Do not add another job database, resource registry or recovery rule.

Bound tool output and page large results; truncation must be explicit and retain a way to retrieve
needed evidence. Prefer existing summaries. Never turn a timeout, incomplete output or unknown
cleanup into success. Never import shell credentials or print environment values for discovery.

## Distribution and compatibility

Publish the plugin alongside the matching stable Governance release with digests and installation
instructions. Build from the maintained source; no workstation-specific packaged paths. Use a
supported plugin/bundle runtime strategy rather than assuming `node` exists on a GUI app’s PATH.
Machine-local setup resolves the supported Node and registered runtime. A missing prerequisite gets
a clear setup instruction. Document the tested macOS architectures and Claude Desktop versions;
unsupported combinations must not be advertised as qualified.

Plugin/runtime compatibility is explicit and tested. Installing a plugin never changes a project’s
runtime pin. The host-neutral adapter core may be reusable later, but no speculative Codex packaging
or shared-host abstraction is required now.

## Acceptance criteria

```governance-spec
{"version":1,"criteria":[
 {"id":"C1","claim":"A real Cowork session invokes the plugin on the Mac and completes a task/context/edit/check/fix/checkpoint/local-commit journey through the registered native runtime.","verification":"semantic"},
 {"id":"C2","claim":"Every exposed operation has a bounded typed schema and preserves project, session, runtime and candidate identity without a generic shell or a second runtime authority.","verification":"mechanical"},
 {"id":"C3","claim":"Stale edits, escaping paths, changed runtime entries and unrelated staged work cannot be silently overwritten or falsely verified.","verification":"mechanical"},
 {"id":"C4","claim":"Detached check results remain retrievable after connection loss, and cancellation and failures retain native semantics.","verification":"mechanical"},
 {"id":"C5","claim":"The published plugin installs using machine-local configuration on different supported Mac layouts without author-specific paths, project data or credentials.","verification":"mechanical"},
 {"id":"C6","claim":"The final reviewed release includes the plugin, compatibility/setup documentation and verified archive metadata without changing adopter pins or running GitHub CI.","verification":"semantic"}
]}
```

## Verification strategy

First qualify actual Cowork transport with a harmless platform probe outside source. If the local
plugin transport is unavailable, investigate supported alternatives with Opus; do not publish a
terminal-only demonstration as Cowork support. Test file-copy versus live-mount behavior and use the
explicit native file path when copies differ. A pure protocol harness proves adapter behavior, not
host availability.

At the coherent implementation boundary, exercise positive and negative operation fixtures, the
native installed-archive journey, reconnect/cancellation and normal Git hooks. Test relocated homes,
spaces in paths, missing prerequisites and malformed configuration. A second configuration fixture
is not a second physical Mac; label these proofs separately. Verify actual host behavior on each
architecture claimed supported, or state the narrower support truthfully.

Opus 5.5 high reviews the spec/plan, then the final code and evidence. Reconcile substantive findings.
Perform normal source hooks and exact archive release proof locally. Verify the published tag,
source, plugin/runtime digests and latest channel before claiming publication.

## Research and related contracts

Reviewed 2026-11-10: [Anthropic connector guidance](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors)
and [plugin guidance](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
document local MCP plugins for Cowork. They expose relative update dates, not exact dates.
[Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) describes packaging;
it does not itself prove Cowork host execution. Treat these as vendor documentation, with actual
host qualification still required. The [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
provides maintained transport handling; prefer it over inventing a production protocol implementation.

Existing owners: `runtime-invocation.ts`, the harness task store, context-route, detached checks,
source hooks and the runtime installation contract. Operational evidence stays outside this checkout.

## Reviewed implementation contract

The runtime owns every operation that changes a candidate or records authoritative evidence. Add one
`cowork <operation>` managed command reading bounded JSON from stdin and dispatching a fixed typed operation set; classify effects from the argv operation and reject any mismatching stdin operation;
this avoids exposing private questions, file content and commit messages in process arguments. Existing
task/context/check operations reuse their current implementation in-process. The transport contains
no file-write, Git-commit, candidate-hashing or task-policy implementation.

Split the model tools by effect: projects; task-start, task-resume, task-show, task-checkpoint;
context, skill-read; file-read, file-apply; check-start, check-status, check-output, check-cancel;
commit, commit-status. All accept strict objects without additional fields. Bound operations require `project_id`, `session` and `task_id`; mutations also require the expected task version. Historical run observation does not require the current task version. Start returns a fresh opaque `cowork:<uuid>` continuation handle. Resume reuses a supplied valid handle and mints one only when omitted. Existing native task bindings validate subsequent calls; a handle
is not an authenticated conversation identity. Read-only descriptors describe effects accurately;
context retrieval and check output may record receipts and use already permitted decision providers.

`file-read` accepts a relative path and bounded offset/length, returning content, full-file SHA256,
size and explicit pagination. `file-apply` accepts text edits with an expected SHA256 or `absent`;
write and delete are supported, and a rename is an explicit old-path delete plus new-path write.
Preflight all edits, preserve modes, record task write paths, and return per-file results. Multi-file
updates are not advertised as transactional. If interrupted, report the subset applied and reread
before retrying; never silently replay a batch. Use existing safe reads and credential exclusions,
but do not confuse retrieval’s extension whitelist with permission to edit normal dependency files.

`check-start` accepts the chosen paths and their expected SHA256/absence, plus the bound task revision.
Compare expectations inside native scope capture before dispatch; the existing packet capture checks
subsequent drift. The ordinary selected-path check uses pre-commit semantics with explicit worktree
paths and HEAD as comparison base (including the existing unborn-head route). Do not compare raw
worktree SHA256 with index Git object IDs. Status/output/cancel reference a native run ID and verify
its project/task binding before returning or changing it.

`commit` accepts selected paths, expected worktree hashes/absence and a message. Refactor the existing
startup Git admission/snapshot/transition helpers only where genuinely shared; keep startup’s stricter
lock-update policy intact. Use the existing durable command owner and return a request ID; status
re-observes the same receipt after reconnection. Whole selected files are committed with `--only`;
selected partial staging is replaced, while unrelated staged entries and worktree content are
fingerprinted and preserved. Admit new files with intent-to-add and test the failure path. Normal
hooks must run against Git’s temporary commit index. Check managed hook bytes and effective hook
configuration before submission, rather than treating a merely installable hook plan as installed.
Refuse selected hook/runtime authority files. Bind the resulting parent, changed paths and filtered
blob IDs to the prepared candidate. Support the first commit or report that case explicitly before
any staging mutation; it must be covered because newly registered projects can have no HEAD.
A mismatch reports recovery required, never reset/amend/bypass. No new job or resource store is added.

Registration is an explicit host CLI setup operation through the verified installed runtime. It
captures the canonical project, Git worktree identity (not author credentials), current native Node, trusted coordinator executable and
its complete installed-tree binding, generation registry, and an allowlisted environment. It is not exposed to the model.
Store the mapping outside projects with owner-only permissions. Invocation uses that fixed coordinator
with `runtime-run`, whose existing generation selection verifies the current project lock. Never
accept a replacement executable based on its filename or directory suffix alone. A registration must select the current installed coordinator, never an older coordinator against a newer registry. A generation change requires explicit re-registration; the coordinator also checks its executable identity against the generation it acquires before dispatch. Node, registry and generation paths must be outside all registered project roots. Registration reuses the native launcher-equality and full installation verification at the operator-trusted setup boundary.
Capture safe tool-location variables and XDG state location from the registering process, not a new
login shell. Do not capture secrets, `CODEX_*`, inherited session IDs or runtime reader tokens.

Package the transport as a supported Node MCPB bundle within the plugin. The portable diagnostic
established this route on Claude Desktop; do not depend on a shell PATH or embedded author-specific
Node path. The adapter’s Node compatibility and the runtime’s Node 24 requirement are distinct.
Registration locates the latter. Bundle the maintained MCP transport dependency with license metadata.
No extra marketplace repository or daemon is required.

New native operations require the release that introduces them. The plugin reports `runtime-too-old`
per registered project until deliberate adoption; it never alters pins. Use a minor feature release
on the verified latest stable line unless the compatibility review establishes a different requirement.


Commit submission persists its preparation binding in the existing native command evidence before
launch: project/task/session, prior branch/HEAD, selected paths, expected filtered blobs and unrelated
index fingerprint. A native finalizer records immediate post-command preservation evidence before
returning a terminal successful result. Later polling reuses that original evidence; it does not
infer historical index preservation from the current index. Resolve the original commit by its
recorded ID, or the unique first-parent child of the original HEAD when interrupted, and verify its
immutable tree/parent facts. An unresolved result stays recovery-required. A subsequent unrelated
commit does not invalidate an already recorded successful original result.

Commit admission also verifies the launcher against the current installed runtime, not just managed
hook bytes. Reuse the startup authority-path predicate plus `.governance/` to reject authority edits.
The checks are not an OS sandbox: a concurrent uncooperative host writer can still change executable
project content between observation and execution; the setup disclosure describes this trust boundary.
Use a command deadline longer than the contained hook deadline. Registration has a versioned schema,
does not capture Git author overrides or terminal GPG_TTY, and returns useful re-registration/version
errors without echoing private stdin. Read-only gateway operations must not mark a generation written.
