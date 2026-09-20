# Installation, telemetry, host support, measurement and indexing

Date: 2026-09-19
Status: historical proposal, accepted with superseding scope decisions; additions remain unimplemented.
Scope: Project Harness with Project Governance, entered through Codex or Claude Cowork.

## Superseding decision

The user accepted this proposal with Codex-only adoption and governance-required bundling.
[Current installation contract](../specs/installation.md) supersedes the separate-product/dual-lock
and Cowork-first recommendations below. [Current specs](../specs/README.md) incorporate telemetry,
qualification and gated indexing. This dated proposal is preserved as decision history.

## Recommendation

Offer one coordinated installation, retain two independently released components, and qualify the actual app connection before broad adoption. Measure a few useful outcomes locally. Add a small regression/performance suite around existing tests. Start code discovery with targeted search; introduce a disposable repository map only when a pilot shows repeated discovery costs.

This proposal supplements the [architecture assessment](2026-09-19-greenfield-assessment.md) and [implementation reconciliation](2026-09-19-implementation-reconciliation.md). It does not claim measured token savings or completed desktop qualification. Command names and limits proposed below are design choices, not existing interfaces or measured guarantees.

## 1. Installation: one experience, two components

### What exists

Governance already installs an immutable, hash-pinned Python runtime and manages candidate runtime generations. Harness is still a private, version 0.0.0 Node package. Its `init --apply` installs instruction blocks; that is not a distributable runtime installer or proof that a host can call it.

There is also a naming collision: governance's existing `harness_integration.py` installs **cross-model delegation instructions and harness-agent skills**. That is not installation of this new Project Harness. Preserve those responsibilities, but distinguish “delegation runner” from “continuity runtime” in installer status and documentation.

### Alternatives

| Approach | Benefit | Cost | Decision |
|---|---|---|---|
| Two unrelated installs | Least coordination work initially | Users resolve versions, hooks and failures themselves | Retain for development; not the adoption experience |
| Bundle harness into the governance runtime | One artifact | Couples Python/Node packaging and release schedules | Reject |
| Governance installs an optional, pinned companion | One setup; independent releases | Requires a small compatibility and activation contract | Recommend |
| New umbrella installer product | Neutral ownership | A third release system before we need it | Defer |

For new development projects, present governance plus harness as the recommended profile. Existing governance projects opt in once. Governance remains usable by itself; uninstalling harness must leave governance and authored instructions intact.

### Ownership and pins

- Governance owns the installation workflow, its own policy, checks and executor.
- Harness owns its release artifact, continuity contracts, storage migrations and host adapters.
- Each component publishes supported protocol/schema ranges. Integration CI records the exact pairs tested.
- Keep the existing governance lock authoritative for governance. Add a harness lock with artifact URL, version, digest, source commit, Node requirements, protocol compatibility and adapter version. Do not duplicate governance's artifact coordinates in that file.
- Derive a deployment identity from both lock digests. Save it in an activation receipt, not a third editable lock. A tested-pair release manifest is evidence, not a competing configuration source.

Compatible does not mean tested. Status must report both. Reject incompatible protocols; label compatible but unqualified combinations for development use only. Production adoption uses an exact qualified pair.

### Proposed installation sequence

1. **Inspect.** Locate the real Git common directory, current workspace, existing locks, runtime generations, instruction markers and host registrations. Detect linked worktrees, permissions and active jobs. Do not infer filesystem access from an app's name.
2. **Resolve.** Select an exact compatible pair from pinned configuration and published compatibility metadata. Normal task startup checks installed state locally; it does not independently query two release services every time. Reuse governance's existing bounded update policy.
3. **Stage.** Verify artifact hashes before execution. Prepare the governance candidate and a minimal harness release in owned runtime directories. Harness production installation must not install development dependencies. Use an explicit Node executable; do not assume an interactive shell's PATH.
4. **Validate.** Run provider-free contract smoke tests and check schema compatibility. Verify the host adapter separately. A local CLI passing does not mark Cowork ready.
5. **Activate.** Under a repository installation lease, write a recoverable install journal and switch the selected runtime generation. Initially retain governance's existing activation mechanism; add paired validation and recovery around it rather than claiming two independent pointer changes are atomic. New calls are blocked during an incomplete activation; recovery finishes or restores the previous selection.
6. **Connect.** Install one owned routing block and the selected host integration. Preserve authored content and other installers' markers. Register a hook at one level only; avoid both global and project copies doing the same work.
7. **Read back.** Report the two versions/digests, host/mode, store location, session binding, test dispatch/result path, and any unqualified capability. Re-running setup must be idempotent.

Incompatible storage migrations need an exclusive maintenance window: drain jobs and writers first. Code rollback alone cannot undo a database migration. Preserve migration backups, but never restore an old backup over newer work automatically. An active job remains bound to the executor generation that started it until its evidence and cleanup are resolved.

A linked worktree gets its own workspace identity and bindings, not an independent copy of the shared operational database. If branches request incompatible runtime/schema versions, report that conflict and stop activation. Do not let the newest branch silently migrate a store used by older sessions.

For adoption, first qualify macOS with the actual supported Node version and both installed apps. Other operating systems need explicit packaging and path qualification before support claims.

## 2. Telemetry: small, local and useful

### Reuse existing owners

Governance already bounds its telemetry to 1,000 records and 1 MiB, sanitizes fields and treats failures as advisory. Consume its public telemetry summary where sufficient. Add a narrow public observation/export contract only if joining records needs more information. Do not parse private executor databases or write a second copy of every check event.

Harness currently records native usage observations with unknown values preserved and stable measurement IDs. It does not yet provide the retention and operational report proposed here.

| Question | Minimal measurement | Owner |
|---|---|---|
| Are we rebuilding context? | Resume count, returned bytes, subsequent registered retrieval bytes, budget exhaustion | Harness |
| Are checks repeated or slow? | Equivalent-scope repeats, selection/queue/execution duration, result category | Governance |
| Is continuity working? | Resume/reconcile outcomes, stale evidence, overlap conflicts, unresolved executions | Harness |
| Does this reduce accepted-work cost? | Known native tokens/time per accepted task; reopen/rework counts; coverage | Host + task lifecycle |
| Is the harness itself becoming overhead? | CLI elapsed time, adapter delay when observable, store size, analytics drops | Harness/adapter |

Returned bytes are a context-volume measure, **not an exact token count**. Repeated reads are not automatically waste: a changed file or a useful verification can justify them. Distinguish identical content from changed content. Native reads outside the adapter are unobserved unless the host supplies evidence; report that coverage gap.

### Small event contract

Emit at coherent boundaries: resume, retrieval completion, checkpoint, reconciliation, execution transition and task outcome. Do not intercept every tool call or collect per-token events. Use the existing operation result to produce an observation, rather than introducing another LLM step.

Allowlisted fields: schema version, event/measurement ID, timestamp, operation, outcome category, task/attempt/workspace IDs, runtime and adapter versions, duration, output bytes, usage source and nullable native counts. Link an execution observation to the governance run ID. Store requested and observed model separately when available. Bound identifiers and enumerated dimensions.

Never collect prompts, code, command bodies, tool arguments, arbitrary error text or absolute paths in analytics. Local IDs are pseudonymous, not anonymous. Export is explicit and strips local correlation identifiers unless requested.

### Proposed retention and overhead budget

Use a separate local `analytics.db` so analytics contention cannot hold the operational database open. No service or background collector is required.

- Raw observations: newest **1,000**, at most **7 days**, and **1 MiB of payload**, whichever removes data first.
- Daily aggregates: **90 days**, at most **1 MiB**, with at most **64 dimension combinations per day**; overflow rolls into `other`.
- Physical analytics storage: **8 MiB target including journal files**. Bound pages/journal growth; suspend recording on storage errors or budget exhaustion. Logical row limits alone do not bound SQLite disk usage.
- Analytics lock wait: **zero**. Drop an observation rather than delay an operational write. Retention deletes do bounded work; expensive compaction happens only during explicit maintenance.
- Provisional incremental latency target: **p95 below 5 ms** on the reference machine. Measure it; if missed, reduce detail/frequency before adding an asynchronous service.

Roll up and expire records opportunistically, without a scheduler. Deduplicate an observation and its aggregate update in one analytics transaction. This prevents recovery retries inflating totals. Report retained windows, missing usage and known dropped observations. A crash can lose a best-effort drop counter; never present coverage as complete merely because the counter is zero.

A proposed `harness stats --since 7d` returns one bounded report: accepted tasks, known usage and coverage, context volume, repeated checks, failures/recovery, harness latency and disk usage. No recurring chat messages, dashboard service or model-written weekly report by default.

Operational evidence has a different lifecycle. Tasks, constraints, execution receipts and referenced artifacts must not expire with analytics. Add an explicit closed-task archive/prune workflow later, protecting live jobs and references. Until then, report operational-store growth honestly; bounded analytics does not make the whole store bounded.

### Native usage and real-project evaluation

Use native, documented observations only. Unknown is not zero; cached input and reasoning counts are subsets, not extra tokens to sum again. Subscription costs are not automatically API-priced costs. Avoid storing two copies of the same host measurement.

Cowork offers Team/Enterprise OpenTelemetry containing model/token observations, but it also exports prompts and detailed tool activity. Reuse an already approved stream through an allowlist if available; do not enable this broad collection just to obtain our small metrics. Collector filtering happens after receipt and does not prevent upstream transmission. [Cowork monitoring](https://support.claude.com/en/articles/14477985-monitor-claude-cowork-activity-with-opentelemetry)

Pilot on one real project first, then a second with a different workflow. Compare similar accepted tasks with and without harness assistance; record host/model, task class and changes in scope. Include installation friction, retries and reopened work. Do not rerun identical tasks and mistake familiarity or cached context for harness savings. An initial 10–20 tasks per condition can reveal large problems, but is not a universal statistical proof. Fix the historical baseline denominator before quoting savings percentages.

## 3. Model selection: one policy, host-specific application

A correction matters: governance currently supplies **model-selection guidance**, not an automatic switcher. Its Markdown explicitly says the coordinator interprets the table; the CLI does not enforce it, launch a provider, change a running parent model or authorize delegation.

Keep that policy in governance. Harness should carry the selected task category, policy reference, requested model/effort and observed model when available alongside task evidence. It must not introduce a competing model table or an LLM classification call for every operation.

The decision order remains explicit operator choice, project policy, then governance defaults, constrained by the actual host. Codex model IDs and effort values must not be copied into Cowork. A project can express provider-specific choices for the same task class. Missing availability is a visible unsupported choice, not permission for silent substitution.

Use the policy at a new task or authorized delegation boundary. Do not restart healthy work just to chase a cheaper model. If the current app cannot apply a choice programmatically, report the recommendation and use the app's normal model selection flow. Record actual execution separately; a requested model is not proof of the model used.

If deterministic resolution later earns its cost, add one typed policy/resolution interface **in governance**, consumed by harness and host adapters. Preserve explicit overrides and keep task classification distinct from permission to start another agent.

An owned CLI or desktop app would provide a stronger place to apply the result. Codex App Server exposes model discovery and agent-control interfaces for clients; that is not evidence that an instruction hook can change an existing desktop conversation. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

JEV could later advise on ambiguous task classification or routing after measured calibration. It would not own authorization or become required for startup, checks or resume. Optimize accepted-work cost and rework, not just the price of one model call.

## 4. Codex and Cowork: same contracts, different adapters

Instruction files are entry points, not an execution guarantee. Keep the core operations provider-neutral: identify/bind task, resume, read bounded context, register intent, request a declared governance action, observe its result, checkpoint.

| Host | Proposed route | Qualification needed |
|---|---|---|
| Codex app | Local CLI first; trusted native hooks for suitable lifecycle events | Session identity, root/worktree mapping, hook envelope, compaction, result delivery, usage availability |
| Cowork local execution | Thin plugin exposing narrow local operations; investigate plugin-bundled local MCP | Native runtime reachability, connected-folder boundaries, permissions, session identity, executor completion |
| Cowork cloud execution | Explicit separate capability profile | Whether the installed deployment offers a supported route to the same local owner; do not assume the local plugin route is callable |

Codex merges hook sources and can run matching handlers concurrently. Changed command hooks require trust review. Consequently installation must deduplicate handlers and respect host trust; “seamless” cannot mean bypassing that review. [Codex hooks](https://learn.chatgpt.com/docs/hooks)

Cowork documents native local tool handling alongside Linux-VM code execution, and also cloud sessions. A shell's view of files and binaries can differ from the desktop's view. Therefore a macOS CLI path or Git common directory cannot be assumed visible from Cowork shell execution. [Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)

Plugins are a plausible packaging route: Cowork supports plugin hooks, and plugins can include local MCP servers. That gives us a candidate to qualify, not a completed integration. [Claude plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)

Remote custom connectors originate from Anthropic's infrastructure; legacy `claude_desktop_config.json` local servers are not available in Cowork. Do not propose localhost through that connector path. [Connector network requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

Keep the operational store on the filesystem owned by the local runtime. Do not share an open SQLite database across VM/cloud mounts, synchronize database files, or merge them through Git. A bridge returns bounded typed results and enforces configured repository roots; it is not an unrestricted shell or a second executor. Governance still owns declared execution and cleanup.

**First qualification experiment:** from each actual installed app, bind a task, checkpoint it, close/reopen, resume in a linked worktree, run one declared harmless check, and recover its result after interruption. Confirm the same repository/task identity, separate workspace identity and correct permissions. Also test two sessions against one workspace. Do not claim Cowork support until this works through Cowork itself.

If local Cowork succeeds but cloud Cowork does not, publish that precise support boundary. Manual receipt exchange can preserve some continuity but does not satisfy seamless integration. Do not add a publicly exposed service just to erase the distinction; decide that architecture separately if cloud use is required.

## 5. A lightweight test harness for the harness

Yes. Real-project telemetry reveals usefulness; a small deterministic lab catches broken installation, stale evidence, runaway output and performance regressions before users pay for them.

### Reuse rather than build a second framework

Extend the existing `node:test` suite and CLI fixtures. The last implementation receipt reports 71 passing tests; this proposal does not rerun or broaden that claim. Add a small scenario runner that produces machine-readable measurements from the same public CLI. No LLM, external service, new test framework or continuous benchmark agent.

| Scenario | Required assertion |
|---|---|
| Install, repeat, interrupt, repair | Correct pinned pair; no duplicate routing/hooks; authored text preserved; incomplete activation recoverable |
| Fresh and aged resume | Correct task/revision, mandatory constraints retained, bounded packet or explicit inability to fit |
| Retrieval and cache | Live versus pinned bytes are correct; deleted/renamed files cannot return stale content |
| Two linked worktrees | Shared task history, separate workspace/attempt identity, merge evidence reassessed |
| Two agents in one workspace | Overlapping intent reported; stale reads detected; no invented exclusive ownership |
| Check lifecycle | Pass/fail/pending distinct; submit uncertainty does not execute twice; crash/cancel preserves ownership |
| Compatibility upgrade | Incompatible pair rejected; active job/migration handling preserves evidence |
| Analytics off, full or locked | Operational outcomes unchanged; bounded growth; missing usage remains unknown |
| Thin host adapter | Typed requests validated; wrong roots refused; bounded responses; deduplicated events |

Test fixtures should include a small repository, a larger file inventory, and a prepared aged store. Suggested starting sizes: 100 and 5,000 paths; 200 tasks and 10,000 historical records. Seed fixtures efficiently inside temporary directories; do not generate enormous logs or benchmark real customer repositories in CI.

### Three levels

1. **Each change:** existing unit/contract tests plus only relevant scenario regressions. New smoke layer target below 30 seconds on the reference machine. Hard correctness assertions gate changes.
2. **Release candidate or performance-sensitive change:** a bounded benchmark, target below 90 seconds. Measure cold CLI startup separately from warm operations, five warmups and 20 samples per selected case. Record median/p95, output bytes and store growth. Test the minimum supported Node version and the current qualified version on the initial supported OS.
3. **Adapter/installer changes and before adoption:** one real Codex smoke and one real Cowork smoke, using the actual published pinned artifacts. This is a short manual qualification recipe initially. Mocked hooks and governance source fixtures do not replace it.

Provisional performance goals: small-fixture resume p95 under 250 ms including CLI startup; added analytics p95 under 5 ms; output stays within its configured byte budget. Calibrate these on the reference machine before turning them into hard gates. For regression detection, flag a median increase greater than both 25% and 25 ms, then reproduce once under comparable load. Twenty samples give a rough tail estimate, not precise production p95.

Never weaken correctness for a speed target. Mandatory constraints, durable pre-action records, result identity and no duplicate dispatch are hard gates from the start. Provider calls must remain zero for every core scenario.

Store reviewed baselines keyed by OS/architecture, Node major and fixture version. Keep at most ten local benchmark reports; persist compact release summaries, not every timing sample forever. CI needs one failure summary, not a model diagnosis for every run.

Deliverables are a scenario manifest, runner, small fixture set, compact JSON report and two host smoke recipes. This is a regression tool, not a synthetic benchmark that claims productivity gains.

## 6. Indexing: start shallow, only when it earns its cost

There is a plausible benefit: agents repeatedly rediscover packages, entry points, test locations and relevant docs. A compact repository map can reduce those searches and the context returned. But indexing has update, storage and retrieval costs. An index that is stale or injected wholesale into every prompt can make things worse.

**Start with targeted `rg`/Git discovery as the baseline.** Do not introduce embeddings, a vector database, an always-running watcher or LLM-generated file summaries now.

If the pilot shows repeated navigation is material, add an optional deterministic map containing paths, package roots, manifests, explicitly declared module relationships, test/config locations and documentation entry points. Reuse any suitable public governance discovery facts; the source inspection here does not establish a complete reusable governance code index.

Place it in a disposable cache beside the runtime's local state, outside the tracked working tree. Key immutable entries by repository identity, Git tree and extractor version. Maintain a small workspace-specific overlay for changed/untracked content, with content hashes. Do not merge cache files or let another worktree's dirty overlay become shared truth.

Build on first relevant lookup; update affected entries from a bounded change inventory. Avoid a background daemon. Honor configured exclusions, ignore generated/vendor/binary files, do not follow symlinks out of scope, and exclude secret-bearing files explicitly. Git ignore rules alone are not a secrets policy.

Return only a bounded list of candidate paths and reasons. The host reads exact current or pinned bytes through the existing retrieval contract. The map cannot select mandatory checks, override scope, certify dependencies or prove a source is current without validation. After merge/rebase, select or rebuild the cache for the resulting tree.

A practical trigger is repeated discovery appearing in several representative tasks and a small comparison showing lower retrieval volume or faster successful navigation. This need not require comprehensive read interception: use a bounded observed sample. Compare targeted search with the map on known navigation questions and measure correct-file discovery, stale hits, latency, output volume and refresh cost.

Add language-aware symbol extraction only if package/path information proves insufficient. Consider semantic embeddings only if lexical/symbol search repeatedly misses relevant code and the measured gain exceeds index construction and invalidation costs. Keep either optional.

Mnemos remains a later substrate candidate for cross-project relationships or experience retrieval. A repository map could become a rebuildable projection into it. Neither code indexing nor this installation work requires moving authority out of SQLite or introducing Mnemos now.

## Delivery order and decision gates

1. Prove one task lifecycle through both actual apps; make Cowork local/cloud support explicit.
2. Define the public compatibility handshake and release harness as a pinned artifact; add governance's optional companion installation through a separately scoped governance change.
3. Implement the bounded report/retention and regression scenarios together, so measurement overhead is itself measured.
4. Pilot on one project, then a second. Resolve baseline/coverage issues before claiming savings.
5. Add a repository map only if the pilot justifies it. Revisit automated routing, semantic indexing, Mnemos and an owned front end using that evidence.

This turn changes only this proposal. Implementation changes to governance require work in its own project; it remained read-only here.

## Local source basis

- Harness: `package.json`, `src/ops/adapter.ts`, `src/store/store.ts`, `docs/specs/host-integration.md`, `docs/specs/evidence.md`, and the linked implementation reconciliation.
- Governance (read-only): `src/project_governance_runtime/installation.py`, `startup_installation.py`, `harness_integration.py`, `telemetry.py`, `cli.py`, and `assets/skills/resources/model-selection.md` under `/Users/stacy/ORGANTA/project-governance`.
- Official host documentation is linked at the claims it supports. These are rolling pages checked for this September 2026 proposal; installed-version qualification remains necessary.
