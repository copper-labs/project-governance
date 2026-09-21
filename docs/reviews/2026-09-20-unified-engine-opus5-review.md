---
id: review.unified-engine-opus5-initial
title: Unified Engine — Opus 5 Extra-High Review
type: review
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Independent read-only review of the unified-engine specifications and transition plan before reconciliation.
---

Reviewer output below is preserved verbatim. Findings describe the pre-reconciliation snapshot;
see the [receipt](2026-09-20-unified-engine-opus5-initial-receipt.json) for identity and the
[reconciliation](2026-09-20-unified-engine-reconciliation.md) for dispositions and current readiness.
Reviewer recommendations are advisory, not operator decisions or runtime qualification.

# Architecture Review — Unified Development Engine (specs + transition plan)

**Scope reviewed:** working-tree state of `docs/specs/unified-development-engine.md`, `docs/exec-plans/active/2026-09-20-unified-development-engine.md`, `docs/reference/2026-09-20-engine-migration-inventory.md`, `docs/specs/engine-workflow-and-device-contract.md`, `docs/specs/engine-memory-boundary.md`, `docs/specs/engine-local-ci-and-merge-contract.md`, `docs/specs/engine-capability-boundaries.md`, `CHARTER.md`, `AGENTS.md`, and the owning source contracts under `components/harness/docs/specs/**` (concurrency, operational-store, execution, decision-interface, host-integration, measurement, development-loop, repository-discovery). Read-only; no build, install, network call, adopter inspection or runtime evidence.

---

## Overall assessment

The design set is unusually disciplined about the things that normally go wrong in a rewrite of this shape. Authority separation is stated consistently and repeatedly: models never own permission, proof validity, publication or acceptance (`docs/specs/unified-development-engine.md:53`, `docs/specs/engine-capability-boundaries.md:31-33`, `docs/specs/engine-local-ci-and-merge-contract.md:105-107`). The distinction between *execution placement* and *merge authority* (`engine-local-ci-and-merge-contract.md:26-32`) is the right cut and is held throughout. The memory boundary is a genuine port, not a disguised dependency (`engine-memory-boundary.md:53-63`). The capability boundary correctly extracts design consequences from release work without importing release implementation (`engine-capability-boundaries.md:63-72`). Category coverage in C01–C18 is path-complete and honest about what path-completeness does not prove (`2026-09-20-engine-migration-inventory.md:21-26`).

The weaknesses are not in the contracts' content; they are in **where responsibility is physically located** and in **what authorizes the irreversible step**. Three of them are concrete:

1. The workflow contract requires host-scoped, durable, inspectable resource ownership, but every durable store named in the current system is repository-scoped, and the current execution contract explicitly refuses to add a claim manager. There is no designated owner for the one thing the first workflow most depends on.
2. The plan commits to a single coordinated breaking cutover of critical state with no declared post-activation recovery policy and no declared evidence gate that authorizes the cutover — while the program's own headline metric (host coordination/token cost) is recorded as partly unmeasurable.
3. Adopter-facing evidence from E2/E4 has no named delivery vehicle between "installed Python product" and "batch-D package transition."

None of these argue against the accepted direction. All three are cheap to fix now and expensive to fix after batch A freezes a schema or batch D ships.

Secondary but real: eleven concrete obligations still live inside current specs addressed to S3/S4/S7, and the plan's S→E mapping is theme-level only, so specific committed behavior has a nominal owner but no textual home.

---

## Prioritized findings

### F1 — High — Host-scoped resource ownership is required but has no store, owner, or cross-version rule

**Evidence.** `docs/specs/engine-workflow-and-device-contract.md:72-80` requires naming the owner for processes, Metro/service ports, shared build outputs, simulator instances and physical devices, and states: *"Scope resource identity to the host and actual resource, not just repository path. Two repositories or worktrees can conflict"* and *"Acquisition, generation, held resources and confirmed release are durable and inspectable."*

Against that, the current system has:
- `components/harness/docs/specs/operational-store.md:22` — the only durable store is at `git rev-parse --git-common-dir` + `harness/harness.db`; **repository-scoped**, and `:27` states network-shared databases are unsupported.
- `components/harness/docs/specs/concurrency.md:37-38` — *"Separate worktrees isolate checkout files, not ports, devices, global caches, shared services or deployment targets. Resource claims and cleanup remain with their existing owners."* And `:46` — *"Filesystem-based local identity is not a cross-machine identity scheme."*
- `components/harness/docs/specs/execution.md:65-66` — *"Use governance's existing claims and project-owned device/service locks... **No second claim manager**, build cache, test scheduler or cleanup daemon is added."*
- `components/harness/docs/specs/development-loop.md:174-177` — *"Governance's existing path/root claims do not prove device, simulator or port locking. **Missing ownership blocks that lane** until an explicitly authorized project solution exists."*
- `CHARTER.md:12` — *"Projects pin an exact wheel"* — i.e. two projects on one machine can run two different engine versions.

The workflow contract permits reuse of an existing project lease (`:75`) but does not say what qualifies a project lease as "the owner," nor where the engine's own durable acquisition/generation record lives when the resource is host-scoped.

**Failure scenario.** Two worktrees of two repositories on one Mac, pinned to different engine versions, each start an RN iOS run. Each records a lease in its own repository DB; neither can see the other's. Run B's declared recovery restarts Metro on port 8081 (an action its own recipe authorized on "its" resource) while run A's scenario is mid-assertion. Both runs complete, both record confirmed cleanup, and run A's evidence is bound to a bundle it did not actually exercise. Per `engine-workflow-and-device-contract.md:107` that evidence then satisfies a required claim.

**Minimal resolution.** Make the E1 seam list include one explicit decision, either way:
(a) name a host-scoped resource registry — location outside any repository, schema version, fencing/generation token, and the compatibility rule for two independently pinned engine versions touching it; or
(b) state that first-iteration ownership is **single-workspace only**, that cross-workspace conflict is *detected and reported as a limit* rather than managed, and reserve the registry location in the E1 seam so it can be added later without a second store. Then reconcile `execution.md:65-66` and `concurrency.md:37-38`, which currently forbid what the target contract requires.

---

### F2 — High — No declared evidence gate authorizes the coordinated cutover, and the program's headline metric is partly unmeasurable

**Evidence.** The plan states the cutover recommendation as `2026-09-20-unified-development-engine.md:155`: *"Recommend one coordinated major core release after N1 and the C01–C18 dispositions are accepted."* The gate is **dispositions accepted**, not **benefit demonstrated**.

`docs/specs/unified-development-engine.md:215` requires *"Declare benefit thresholds after baseline variability is known and before evaluating candidates"* — but in context this governs JEV and similar candidates, not the migration itself. Meanwhile:
- `components/harness/docs/specs/measurement-and-qualification.md:58` — *"Uninstrumented native reads and host coordination time remain unknown. Bytes are not token counts."*
- Plan E2 `:96` — *"Measure actual host reads/turns **where available**."*
- `CHARTER.md:33-35` — the design principle requires judging additions *"by better accepted outcomes relative to elapsed time, token use, runtime overhead, and maintenance cost."*

So the program's stated objectives (accepted-work accuracy, whole-loop time, token consumption) have a measurement path that the owning contract already flags as incomplete, and the plan contains no statement of what result would cause the scope to be reduced instead of completed.

**Failure scenario.** Batches A–D complete on schedule. At cutover review, E2/E4 show device-workflow reliability improvements but the host-coordination component — the largest claimed saving — is "unknown" because the host never exposed it. There is no pre-agreed criterion, so the decision defaults to "we already built it." A smaller, defensible end state (TS workflow/execution engine, retained Python checkers) was never evaluated because it was never made a declared fallback.

**Minimal resolution.** Two additions, both cheap and both before candidates are evaluated (as D10 already demands for candidates):
1. In E1, record **baseline instrumentation coverage** explicitly — which of accepted-work rate, loop wall time, and native token totals are actually observable, and which remain unknown.
2. In E0/E1, declare the specific outcomes E2/E4 must show before batch-D packaging cutover is authorized, **and** the named fallback scope if they do not. This is a written threshold, not a new approval gate.

---

### F3 — High — No delivery vehicle for adopter-facing E2/E4 evidence before the batch-D package transition

**Evidence.** The constraints are individually correct and jointly unresolved:
- `unified-development-engine.md:82` — *"Keep the currently installed Python owners intact during construction"*; `:91-92` — *"no copied implementation, permanent compatibility shim or dual authority."*
- `unified-development-engine.md:226-227` (D11) — *"the existing wheel remains the release authority until explicit package/lock transition; **never introduce two independently editable product locks**."*
- Plan E2 `:88-90` — *"Deliver one coherent user-visible path"* including approved workflow dispatch on a real RN iOS simulator; E4 `:140-146` takes it to physical devices. Both require a real adopter machine.
- Plan E5 batch D `:164` — *"Package/lock transition"* is the **last** batch.

So between E2 and batch D, working TS engine code must run on an adopter machine while the installed product is still the Python wheel. The plan alludes to this only at `unified-development-engine.md:92` (*"Temporary development use of current public owners is bounded"*) and never names the mechanism.

**Failure scenario.** Two branches, both bad. (a) E2/E4 proof is produced by invoking a source checkout on the adopter machine. Batch D then changes packaging, dependency resolution, offline behavior and integrity (`unified-development-engine.md:223-224`), so the device and workflow evidence is not installed-artifact evidence and must be re-run at the worst possible moment — after the schema cutover. (b) A preview package is published to avoid that, and two independently editable locks now exist, violating D11 and a stated non-negotiable.

**Minimal resolution.** Declare an explicit **development channel** in the plan: a named, non-default invocation path with its own identity, no second product lock, and evidence labelled *pre-packaging*. Then add one line to E5 batch D naming which E2/E4 claims must be re-qualified on the installed artifact (plausibly: install/launch/bundle-identity and cleanup; not the scenario assertions).

---

### F4 — High — The cutover is effectively forward-only, and no post-activation recovery policy exists

**Evidence.** The requirement is stated; the mechanism is not.
- Plan `:177-178` — *"Rollback must account for schema changes and post-cutover writes; do not just swap executables."* No mechanism follows.
- `2026-09-20-engine-migration-inventory.md:188-189` — *"Migration must be restartable, verify readback before activation and **refuse incompatible downgrade**; a prior package alone is not rollback after a schema change."*
- `components/harness/docs/specs/operational-store.md:27-28` — today's answer is backup-only: *"Migration failure preserves the prior transaction; keep a coherent backup before adopting a new runtime in an important project."*
- C01's cutover evidence (`inventory:49`) is **forward** readback: *"Old schema/history and artifact readback..."* — nothing reverse.

Taken together: downgrade is contractually refused, reverse migration is unspecified, and the only recovery is a pre-cutover backup that discards everything written after activation.

**Failure scenario.** Cutover activates. A week of task revisions, actions, evidence and artifacts accrue under the new schema. A blocking defect surfaces in batch-B execution ownership. Restoring the pre-cutover backup destroys a week of accepted work and proof; downgrading is refused by contract; the only path is forward-fix under pressure, with no bounded expectation set in advance.

**Minimal resolution.** Add a recovery-policy row to batch-D acceptance, choosing one explicitly:
- **Reverse-export reversibility:** prove, before activation, that post-cutover records can be exported in a form the prior owner can read. `operational-store.md:33-38` already provides selected `exportTask` bundles with version, digest, history, evidence and optional artifact content — reuse that surface rather than building a reverse migrator; or
- **Declared forward-only:** state plainly that cutover is forward-only after the first write, name a soak window, and require pre-activation backup + readback proof as the compensating control.

Either is acceptable. Silence is not, given N1 selects a single coordinated breaking release.

---

### F5 — Medium — Concrete S-stage obligations survive inside current specs with no E-stage textual owner

**Evidence.** The plan's coverage table (`:198-207`) maps S1–S9 to E1–E6 at **theme** granularity. Eleven concrete assignments remain live in current contracts, and the specific commitments do not appear in the corresponding E-stage text:

- `components/harness/docs/specs/decision-interface.md:107` — *"S7 adds schema/doctor validation and configuration-migration proof; these keys do not work in the current runtime."*
- `decision-interface.md:114` — *"S7 selects its storage mechanism while preserving failure isolation"* (the cross-process cooldown state), corroborated by `operational-store.md:81` — *"S7 selects bounded advisory storage scoped by repository, provider and nonsecret config revision."*
- `decision-interface.md:116` — *"S7 chooses evaluator-owned execution, runtime integration, or both."*
- `repository-discovery.md:53-56` — *"S3 implements candidate search/ranking, keeping known required paths separate."*
- `development-loop.md:168` — *"S3 adds `harness prepare --task <id> --purpose <implement|investigate|review|resume>` as the normal working-packet entry."*
- `development-loop.md:176-177` — *"S4 owns assessment and any necessary public executor/adapter protocol extension."*

E3's text (`plan:125-136`) never mentions profile schema validation, `doctor` reporting, configuration migration, or the cooldown store. E1/E2 never name the `prepare` surface or the public executor/adapter protocol extension.

**Failure scenario.** E3 ships a JEV adapter behind the narrow interface with correct no-token fallback, but with no `continuity.decisions` schema validation and no `doctor` visibility, because no E-stage text asked for them. The optional capability becomes hand-editable-only and undiagnosable, and the gap is discovered during batch-C acceptance when C17 is reviewed. Separately, the advisory cooldown lands in the critical ledger's transaction path, reintroducing exactly the coupling `measurement-and-qualification.md:47-48` forbids for analytics (*"Drop analytics on contention/failure; never compromise the critical ledger"*).

**Minimal resolution.** Either rewrite the eleven S-references in place to their E owner, or expand the coverage table with one row per concrete obligation (not per theme). Cheapest version: a short appendix in the plan listing each surviving S-reference, its file:line, and its E owner. Explicitly include: `continuity.decisions` schema/doctor/config-migration → E3; cooldown storage, **outside the critical ledger transaction path** → E3; candidate search/ranking → E1/E2 basic map, E3/E4 quality; `prepare` surface and executor protocol extension → E1/E2 under the C16 wire contract.

---

### F6 — Medium — E1's exit depends on an adopter authorization the same document treats as separate, and three downstream lanes depend on that exit

**Evidence.** Plan `:76-81` places the runner assessment, the coordination/time/usage baseline and the minimal structural map inside *"an explicitly authorized adopter assignment."* Plan `:83-84` then makes E1's exit *"bounded recipe, trusted operations, stage/resource owner map, concrete failure cases, migration limits **and a baseline**."* E2 `:87` depends on E1; E3 `:125` begins *"after E1 supplies stable question/evidence identities **and a baseline**"*; the local-CI pilot `:105` begins *"After E1 and the remaining N8–N10 integration choices."*

**Failure scenario.** Adopter authorization is deferred for ordinary reasons (device availability, scheduling, scope review). E1 cannot be declared complete because its exit names a baseline that only the adopter can supply. E2, E3 and the local-CI pilot all read as blocked, so pure contract/fixture work — which needs no adopter, no device and no network — stalls behind an authorization decision it does not actually require.

**Minimal resolution.** Split E1 in the plan:
- **E1a** (no adopter): TS/Node/storage/process seam proof, memory-port fake-provider cases, C02/C05/C08/C14 pure-output comparison fixtures, local/VM/hosted capability and candidate-identity seams, the fake external-operation adapter. Exit = seams + failure cases + migration limits.
- **E1b** (authorized adopter): runner assessment, reuse/repair/replace decision, baseline, minimal structural map.

Re-point E3 and the local-CI pilot at **E1a** plus E1b's baseline only where a comparison genuinely requires it.

---

### F7 — Medium — E2's exit criterion assumes a host wake capability the owning contract records as unqualified

**Evidence.** Plan E2 `:92` — the worker *"emits meaningful change/completion/intervention events"*; `:97-98` — exit is *"one actual workflow completes and recovers under the named ownership contract **without repeated LLM management of ordinary lifecycle transitions**."* `engine-workflow-and-device-contract.md:67` — *"Meaningful progress or intervention wakes the host."*

The current host contract says this is not established:
- `components/harness/docs/specs/host-integration.md` — *"`host hook` currently accepts a bounded SessionStart fixture and emits additional context. It does not install or certify native hooks. **Real Codex session/compaction/completion behavior remains unqualified.**"*
- `components/harness/docs/specs/execution.md` (Waiting and CLI outcomes) — *"This adapter **does not claim automatic turn wakeup**, dispatch notifications or poll with a model in the background."*

D12 (`unified-development-engine.md:234`) handles this correctly at contract level — *"Capability-detect event delivery and stage controls; keep explicit operation when unsupported"* — but E2's **acceptance criterion** is stated unconditionally.

**Failure scenario.** The host offers no inbound wake. E2 is implemented correctly under D12 (bounded explicit waits, no model polling), yet its written exit is unmet. The criterion is then either failed on a technicality or quietly reinterpreted — and in the reinterpretation, the coordination-cost benefit that justifies the whole program goes unproven while E4/E5 proceed.

**Minimal resolution.** Add one E1 item: determine the current host's actual event-delivery/wake capability (this is a host inspection, not adopter runtime evidence). Then restate E2's exit in two forms: **wake-capable** (progress/intervention wakes the host) and **no-wake** (bounded explicit wait, no model-driven polling loop, no per-transition LLM decision) — and say which one the measured benefit claim is made against.

---

### F8 — Medium — Publisher/executor credential separation is required on the local CI path but has no named mechanism or fixture

**Evidence.** `docs/specs/engine-local-ci-and-merge-contract.md:105-107` — *"The publisher must use trusted policy and validator code outside candidate control. **Build/test code must not receive the credential** that can publish the trusted aggregate or merge the branch."* Correct requirement.

But the isolation machinery that follows (`:111-114`) is scoped to *"Untrusted changes"*. For the ordinary trusted path, N9 (`inventory:203`) starts at *"approved maintainer hosts"* with *"Explicitly accept that host-administrator trust"* — i.e. the engine, the build/test execution and the publisher may all sit in one user session on one laptop. Neither E1's fixture list (`plan:68-69`: *"stale candidate, missing capacity, worker loss, untrusted evidence and publication recovery"*) nor the pre-activation proof list (`engine-local-ci-and-merge-contract.md:177-181`: *"missing/duplicate/forged evidence..."*) contains a credential-reachability case.

**Failure scenario.** On an approved maintainer host, an ordinary transitive dependency's install/build script runs inside the executor and reads the publisher credential from the environment, keychain or a config file in the workspace. It publishes a forged required check for a candidate whose tests never ran. The forged-evidence fixture does not catch this, because the evidence is not malformed — it is correctly signed by the authorized publisher. `:106` anticipates the class (*"An App signature authenticates a producer; it does not prove that an arbitrary laptop executed honest tests"*) without closing it for the trusted-host case.

**Minimal resolution.** Name the mechanism for the ordinary local path — publisher runs as a separate OS principal/process with no inherited environment from the executor, credential never present in the executor's environment, workspace or inherited keychain scope — and add *"executor cannot reach the publisher credential"* to both E1's seam fixtures and the pre-activation proof list.

---

### F9 — Medium — Merge execution is specified in depth but assigned to no slice

**Evidence.** The local-CI contract specifies merge behavior at length: `:136-142` (merge queue preference, up-to-date-branch workflow with server-enforced freshness, *"A merge API head-SHA precondition alone is not a base-SHA precondition"*, *"Do not claim an atomic custom merge protocol before proving its server-side enforcement"*), `:144-147` (reconcile remote identity after a merge-request timeout; read back merge result and destination identity), and the flow diagram node *"Authorized protected merge and readback"* (`:50`).

No slice owns it. E2 ends at *"review handoff"* (`plan:90`). The local-CI pilot's step 4 (`plan:115-117`) covers required-check cutover and *"protected merge freshness and destination readback"* — readback, not execution. E5 batch D (`plan:164`) mentions only *"any explicitly adopted CI authority cutover."*

**Failure scenario.** Either the pilot team builds merge-request/queue/base-SHA machinery because the contract demands it — engine-initiated merging arrives without an explicit operator authorization, against `unified-development-engine.md:51` (*"Merge integration... Does not own: ...implicit merge authorization"*) — or nobody builds it and the contract's most detailed section is stranded requirements that later reviewers mistake for unimplemented commitments.

**Minimal resolution.** State the scope decision in one line. **Recommend: engine-initiated merge is out of first-iteration scope.** The engine publishes validated results and reads back required checks, merge result and destination identity; the merge itself remains an operator or platform-queue action. Keep `:136-142` in the contract, marked as requirements for the later merge capability.

---

### F10 — Medium — "Routing" collides between a blocking deterministic check and a proposed model question

**Evidence.** D8 (`unified-development-engine.md:177-179`) lists candidate JEV questions as *"optional-context ranking first, then other recurring questions selected from the full decision map, such as **ambiguous routing** and diagnostic ranking."*

In this repository, "routing" already names a **blocking** deterministic check: `inventory:110` — *"`context-router` | Blocking route/configuration integrity | C11; valid narrow routing, installed skill references and instruction ownership."* And `inventory:151` — *"Required context | **No semantic ranker, index or memory provider may drop mandatory instructions or grant authority.**"*

The owning source contract uses safer language: `components/harness/docs/specs/decision-interface.md` — *"Failure interpretation, **ambiguous intent/skill advice** and worker advice are later consumers"*, with *"Required instructions and mandatory evidence bypass ranking."* D8's wording is the loose one.

**Failure scenario.** An implementer reads D8 and enables a JEV question that selects the applicable route set — plausibly framed as "ranking candidate routes." A model answer now influences which mandatory instructions or packs apply, and `context-router` (a blocking pack) either loses inputs or is evaluated against a model-selected set. This is precisely the class `inventory:151` forbids, reached through a terminology collision rather than a design decision.

**Minimal resolution.** In D8, replace *"ambiguous routing"* with the decision-interface term (*"ambiguous intent/skill advice"*) and add one clause: no JEV question may alter `context-router` outcomes, the mandatory instruction set, or which packs apply.

---

### F11 — Medium — D5 amends a stated non-negotiable but has no acceptance decision in the N-list

**Evidence.** D5 (`unified-development-engine.md:138-141`) — *"This changes the current Markdown-authority formulation: amend the charter and affected contracts together only after **this decision is accepted**."* What it changes:
- `CHARTER.md:8` — *"Markdown is the active authority for governance decisions, plans, and documentation."*
- `AGENTS.md:12` — *"Markdown is the active governance authority"* — listed under **Non-Negotiables**.

The acceptance path is ambiguous. `plan:46-48` carries an unchecked E0 item — *"Amend charter/specifications to match accepted decisions, including executable-policy ownership and distribution"* — which reads as editorial follow-through. N1–N10 (`inventory:195-204`) contains **no** decision for D5. And `unified-development-engine.md:275` says *"D1–D14 retain design rationale; do not ask the same broad direction questions again,"* which can be read as D5 already being accepted.

**Failure scenario.** Two symmetric failures. Either the E0 checkbox is executed as cleanup and a stated non-negotiable changes without an explicit operator decision — exactly the silent-enforcement-change the inventory warns against (`:19-20`, `:42-43`) — or the item stalls as "needs acceptance," and C14's typed rule normalization (batch A) cannot start because its premise is unresolved.

**Minimal resolution.** Add one decision to the N-list: accept or reject D5's executable-policy ownership, stating what remains Markdown-authoritative (rationale, judgment, exceptions, and the authority to change a rule). Make it a **precondition for C14/batch-A work**, not an E0 editorial step. Recommended shape in the operator-decisions section below.

---

### F12 — Low — Memory projection fields are required before schema freeze but absent from batch-A acceptance

**Evidence.** D4 (`unified-development-engine.md:120-122`) — the memory boundary's fields and fixtures must be included *"before core schema freeze."* `engine-memory-boundary.md:31` heads the obligations table *"Design obligations before the first core schema freezes"*, and `:64-66` requires that *"Critical task changes and the minimal projection-intent marker can commit in one operational transaction"* plus a provider cursor/watermark and independent withdrawal preservation (`:72-75`).

E5 batch A (`plan:161`) covers C01/C02/C14/C16 with acceptance *"Current/dirty/staged subjects, task/evidence history, findings, exceptions, schema/version refusal"* — no projection marker, watermark or withdrawal field. C17 sits in batch C (`plan:163`). E1 (`plan:61-63`) does say *"before freezing core records"*, but does not enumerate the fields.

**Failure scenario.** Batch A freezes the critical schema without the projection-intent marker and withdrawal propagation columns. E6 then requires a migration of the critical store — the specific thing the single coordinated cutover was designed to avoid repeating.

**Minimal resolution.** Add projection-intent marker, provider watermark/cursor and withdrawal propagation to batch A's acceptance row and to E1's "before freezing core records" checklist. One line each; no implementation implied.

---

## Operator decisions genuinely needed, and before which slice

These are the decisions whose absence causes rework or loss. N1–N10 remain the declared gate (`plan:43-44` is still unchecked) and are not reopened here.

| # | Decision | Needed before | Recommendation and reason |
|---|---|---|---|
| **OD1** | Accept or reject **D5** (one validated declaration or code owner per machine-enforceable rule) and state what remains Markdown-authoritative. | **Batch A / C14**, and before the E0 charter amendment is executed. | **Accept a narrowed form:** each machine-enforceable rule gets one code/declaration owner; Markdown retains rationale, exceptions, judgment and the authority to change a rule; the charter and `AGENTS.md` non-negotiable are amended **in the same change** that lands the first typed rule owner, not ahead of it. *Reason:* C14 normalization has no premise without it, and it is the only item in the set that edits a stated non-negotiable — it should not arrive as editorial cleanup. (F11) |
| **OD2** | First-iteration scope for **host-scoped resource ownership**: managed cross-workspace registry, or single-workspace with reported conflict limits. | **E1** — it determines a store and a fencing design. | **Single-workspace ownership for the first iteration**, with explicit detection and a reported conflict limit, *plus* a reserved host-scoped registry location in the E1 seam so it can be added without introducing a second store. *Reason:* a machine-wide registry shared by independently pinned engine versions (`CHARTER.md:12`) is a cross-version compatibility product in its own right; building it in E1 is disproportionate, but freezing a repository-scoped-only design makes it unreachable later. (F1) |
| **OD3** | Is **engine-initiated protected merge** in first-iteration scope? | **Local-CI pilot** (E2-adjacent). | **No.** Publish validated results and read back required checks, merge result and destination identity; the merge remains an operator or platform-queue action. *Reason:* the contract's queue/base-SHA/atomicity requirements (`engine-local-ci-and-merge-contract.md:136-142`) are real but belong to a later capability; building them by implication grants the engine an authority nobody authorized. (F9) |
| **OD4** | **Post-cutover recovery policy**: reverse-export reversibility, or declared forward-only with a soak window. | **Batch D acceptance is written** (decidable later than E1, but not after activation). | **Forward-only after first write**, compensated by proven pre-activation backup + readback, a named soak window, and a post-activation export of new records in the existing `exportTask` bundle form (`operational-store.md:33-38`). *Reason:* bidirectional schema support is the permanent compatibility layer the operator excluded; an honest forward-only policy with a working export is cheaper and more truthful than an unstated one. (F4) |
| **OD5** | **What evidence authorizes the cutover** — the specific E2/E4 outcomes required before batch D, and the fallback scope if they are not met. | **E1 exits** (thresholds must precede candidate evaluation, per D10 `unified-development-engine.md:215`). | Declare two or three concrete outcomes (e.g. operator interventions per accepted device fix; wall time from task start to accepted; native token total where observable), record which are *unmeasurable* per `measurement-and-qualification.md:58`, and name the fallback end state if they are not met. *Reason:* the charter's own design principle (`CHARTER.md:31-35`) requires this of any addition; the migration is the largest one in the program and currently the only one with no threshold. (F2) |

---

## Optional simplification candidates

Offered only where the benefit exceeds the flexibility lost. Both are reversible on paper.

**SC1 — Bind first-iteration local CI to the one already-authorized integration path; document the second as supported-but-unimplemented.**
`engine-local-ci-and-merge-contract.md:121-124` describes two integration mechanisms (Actions + ephemeral self-hosted workers; trusted App publisher) and `:119` already instructs *"inspect and reuse the already authorized mechanism before choosing adapter work."* Making that binding for the first iteration means one adapter, one trust model, one recovery path and one publication-failure story to qualify in the pilot. **Flexibility cost is near zero** — the contract text for the other path is already written, so adding it later is documentation-complete. This also removes the ambiguity in E1 about how many publisher seams need fixtures (`plan:66-69`).

**SC2 — Collapse the throughput/constrained profile pair into one qualified profile plus a resource-sensitivity flag on the claim.**
`engine-local-ci-and-merge-contract.md:76-80` introduces two profile classes before any local check has been qualified. The environment dimension table (`:59-70`) already records capacity, toolchain and isolation per run, so the substantive constraint — *"A faster CPU or larger memory allocation... cannot certify a smaller resource budget"* — is expressible as a flag on the claim rather than a second profile class. **Flexibility cost is low**, and the second class can be reintroduced the first time a genuinely resource-sensitive claim exists. Weaker candidate than SC1; skip if the pilot already has a resource-sensitive check in hand.

I deliberately do **not** recommend deferring the E1 fake external-operation adapter (`engine-capability-boundaries.md:117-122`). Its fixtures are cheap, and the consequence it protects against — a core record shape that cannot express external-operation identity or an `unknown` outcome surviving runner exit — is a schema mistake that batch A would freeze.

---

## Readiness

**Starting E1 — close, with two prerequisites.** The seams are specified well enough for a competent team to write fixtures today: the transaction-plus-event, competing-observer, interrupted-submission, child-cleanup, restart and resumption cases (`plan:58-64`) are concrete; the memory port's fake-provider cases (`engine-memory-boundary.md:95-96`) are enumerated; the C02/C05/C08/C14 pure-output comparison idea is the right guard against silent gate drift. What must land first is **OD2** (F1 — otherwise E1 freezes a resource model the first workflow cannot use) and **OD5** (F2 — thresholds must precede the baseline, not follow it). Applying the **E1a/E1b split** (F6) would additionally let the non-adopter contract work start immediately rather than waiting on an adopter authorization it does not need. The four unchecked E0 items (`plan:43-51`) do not all block E1a: N1–N10 dispositions and the adopter audit gate *dependent implementation* and *cutover*, not seam fixtures.

**Production / cutover readiness — not ready, and not close.** Four blockers stand between the current documents and an authorized cutover, independent of how much code gets written: no host-scoped resource owner (F1), no declared authorization evidence (F2), no delivery vehicle for the adopter-facing evidence that is supposed to justify it (F3), and no post-activation recovery policy for an irreversible critical-state migration (F4). Beyond those, the plan's own unchecked item at `:45-46` is decisive and correctly stated: *"Audit the authorized adopter's actual installed hooks, target packs, policies, runner/resource owners and legacy integrations; **source inventory is not proof of installed adoption**."* Nothing in the current document set substitutes for that audit, and it has not happened.

The two readiness questions are properly independent. E1 can start on a narrow, well-specified set of contract proofs without touching an adopter, a device, a network or the installed product — which is exactly what the accepted direction wants, provided E1's exit is not written to require things E1 cannot obtain.

---

## Review limits

**What I did.** Read-only inspection of the working tree. I read the seven named documents in full, `CHARTER.md` and `AGENTS.md` in full, and these owning source contracts: `concurrency.md`, `operational-store.md`, `execution.md` (through the coordinated-proof section), `decision-interface.md` in full, `host-integration.md` in full, `measurement-and-qualification.md` (ownership through report), and excerpts of `development-loop.md` and `repository-discovery.md`. I confirmed by directory listing that the source-snapshot JSON exists and that thirteen pack definition files exist by name.

**What I did not do.** No command was run against the runtime, no build, install, test, network call or credential access. I did not read all 352 snapshot entries, did not verify the snapshot's hash claims or its assignment completeness, did not open the individual pack YAMLs, the Python runtime sources, the KMP specs, or the completed lean-operating-model closeout. I inspected no adopter, no installed configuration and no runtime evidence.

**Observation versus inference.** Everything quoted with a `file:line` citation is observed text in the current working tree. Every failure scenario is **inference** — a constructed path from the cited contracts to a loss, not a reproduced defect. Statements about the current host's capabilities come from `host-integration.md`, which itself records that behavior as unqualified; I did not observe the host.

**Not assessed.** JEV's actual latency, answer quality, telemetry granularity or billing — `unified-development-engine.md:188-189` is arithmetic within the document and I did not verify the external pricing page or evaluate whether free-output pricing yields usage accounting comparable to D10's native-token requirement. Mnemos's real API surface, storage semantics or platform parity. The truth of the operator's report that GitHub local-CI authorization exists, which I took as given and did not reopen. Whether the C01–C18 treatments are individually correct at clause level — the plan's own pre-cutover parity requirement (`plan:50-51`) is the right place for that, and it has not been performed.
