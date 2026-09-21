---
id: review.decision-first-opus5
title: Opus 5 Decision-First Design Review
type: review
status: current
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Independent Opus 5 high-effort review of the frozen documentation candidate.
---

# Architecture review — decision-first development loop (documentation/planning qualification)

**Candidate:** 17 files, all SHA-256 hashes matching `/tmp/governance-decision-review-freeze.json` (verified 0 mismatches at review time). Branch `codex/harness-monorepo`. Read-only; no files changed, no tests run, no models launched, no secrets inspected.

## Verdict

**Approve the direction; do not start S3 implementation until the mandatory fixes below land.**

The architecture is sound and unusually well-bounded: one wheel, one executor owner, one store, provider-optional by construction, and a consistently honest separation of "accepted design" from "implemented." I verified the core factual claims against source and they hold — the 40-path discovery cap (`components/harness/src/ops/retrieval.ts:154`), submit protocol 1|2 with terminal protocol 1 (`ops/execution.ts:193,254`), the 0–30s wait bound (`ops/execution.ts:66`), and the absence of any decision/JEV/analytics module in `components/harness/src`. The claim boundaries are the strongest part of this document set.

The problem is that the change set does not deliver its own stated goal. The goal is *less repeated reading and reasoning per accepted change*. The plan set now spreads one sequence across four competing numbered plans and duplicates its key rules four to five times each, and the handoff's reading list runs to roughly 1,900 lines before an agent writes a line of code. Several load-bearing dependencies (device resource ownership, executor protocol extension, native usage coverage) are asserted as "existing" but do not exist and are not assigned to any slice.

---

## Mandatory fixes

### 1. A complete competing specification family with colliding document IDs is live in the tree — Critical

`docs/research/decision-first-harness/specs/` contains 13 draft specs and `.../plans/` contains a `plan.harness.master` plus `phase-0`…`phase-5`. Five `id:` values collide exactly with the live contracts: `spec.harness.decision-interface`, `spec.harness.ecosystem-adapters`, `spec.harness.failure-triage`, `spec.harness.host-integration`, `spec.harness.worker-invocation`. Two more — `spec.harness.context-packet` and `spec.harness.build-orchestration` — are draft versions of the exact contracts S3 and S4 are about to write.

This violates the AGENTS.md non-negotiable against a second authority, and directly contradicts the plan's own instruction (`docs/exec-plans/active/2026-09-19-decision-first-development-loop.md:136`) to "reconcile the existing decision contract rather than maintaining two competing specifications." The handoff (`:26`) instead tells the next agent to *preserve* this tree untouched. An agent that greps `spec.harness.decision-interface` gets two hits with different content.

Compounding: `components/harness/docs/research/` and `docs/research/decision-first-harness/` are two divergent copies — `builds-and-checks.md`, `flow.md`, `portal-case-study.md`, `release-management.md` all exist in both and all differ. The plan's "Starting evidence" (`:32-34`) cites the `components/harness` copy without noting the divergent twin.

**Smallest repair:** namespace every ID under `docs/research/**` (`research.harness.*`), and add one line to `docs/research/README.md` and the handoff stating that `decision-first-harness/specs` and `/plans` are superseded by `components/harness/docs/specs/**` and the S1–S9 sequence, retained only as dated rationale. Do not delete — the handoff correctly protects uncommitted research.

### 2. Four overlapping sequences for one plan; six stale documents sit in `active/` — High

`components/harness/docs/exec-plans/active/` holds eight documents for one workstream:

| Document | Status shown | Actual role |
| --- | --- | --- |
| `2026-09-19-governance-codex-adoption.md` | "single forward implementation plan" | authoritative |
| `2026-09-19-architecture-reset.md` | "Status: complete" | completed work in `active/` |
| `2026-09-19-governance-monorepo-proposal.md` (284 lines) | — | README calls it historical |
| `step-1`, `step-2`, `step-4`, `step-5` | "planned qualification/experiment after the architecture reset" | a second sequence |
| `track-release-preparation.md` | same | — |

Only `step-3-one-decision.md` was updated to defer to S7. Steps 1/2/4/5 retain their own ordering language ("After the first pilot…") and map onto S2, S1/S3, S1/S4 and S5/S6 respectively, while `components/harness/docs/exec-plans/README.md:26` asserts "Supporting step files are not a second sequence." The assertion does not survive reading the files. Add `plan.harness.phase-0..5` (finding 1), the Batch A/B/C sketches in the decision-first plan, and `components/harness/NIGHT-PROGRESS.md` (a fifth status summary pointing at the *architecture-reset* plan as current), and there are five entry points telling a reader what to do next.

**Smallest repair:** move `architecture-reset.md`, the monorepo proposal and `step-1/2/4/5` + `track-release-preparation.md` to `completed/` (or a `superseded/` directory) with a one-line "superseded by S<n>" header each; delete or fold `NIGHT-PROGRESS.md` into the module README.

### 3. Batch A/B/C and S1–S9 are unmapped — High

`docs/exec-plans/active/2026-09-19-decision-first-development-loop.md:22` says the batch sketches "do not override that sequence," then `:240-284` specifies Batch A/B/C with their own acceptance criteria and proof obligations. Batch A ≈ S3, B ≈ S7, C ≈ S4+S5, but Batch A's acceptance ("installed-wheel proof for the new packaged seam") silently presupposes S1 and S2, which it never names. A reader cannot tell whether Batch A is startable.

**Smallest repair:** a three-row table mapping Batch → slices, or delete the batch headings and move their unique content (the evaluation-arm design at `:267-270`, which S7 lacks) into S3/S7.

### 4. Device and simulator work depends on a resource owner that does not exist and is forbidden to build — Critical

Five documents assert an "existing resource owner" for devices, ports, simulators and shared build outputs: `development-loop.md:75,148`, `execution.md:59-61`, `ecosystem-adapters.md:52-54`, the decision-first plan `:232`, adoption plan S5/S6. What actually exists is root-overlap serialization for agent jobs (`src/project_governance_runtime/provider_agents/jobs.py:87-90`) — path-based, with no device, port or simulator concept. `docs/governance/validation-strategy.md:44` states the *policy* ("Serialize commands sharing mutable build outputs or devices") but supplies no mechanism. Meanwhile `execution.md:61` and `architecture-reset.md` both forbid adding one ("No second claim manager… no resource-lock manager").

So S5/S6 depend on a capability that (a) governance does not have, (b) is assumed to live in an unnamed adopter project, and (c) cannot be built here. No slice names the candidate project or platform — S5 says only "Choose one explicitly authorized project and platform using observed cost."

**Smallest repair:** add to S5 a first checklist item: "Name the candidate project and confirm its runner exposes device/simulator acquisition and release; if it does not, S5 is blocked pending a separate authorized decision on where that owner lives." That converts a hidden blocker into a declared one.

### 5. S5/S6 require executor protocol fields that no slice adds — High

`execution.md:91-98` acknowledges "The existing batch protocol is not claimed to implement every workflow field; expose missing facts through the owner public contract." I confirmed the v1 batch request carries only `workspace, idempotency_key, timeout_seconds, inputs, output_roots, cleanup_required, host, cases` (`ops/execution.ts:104,164`) with no target kind, device identity, OS, transport or stage binding, and the Python side (`provider_agents/test_batches.py`) has no such fields either. `harness-agent` is governance-owned (`provider_agents/cli.py:35`), so "upstream" is this same repo — but neither S4, S5, S6 nor S9 has a work item for extending the batch protocol to v3, and `ecosystem-adapters.md:31-35` forbids working around it locally.

This is a cross-language change (TypeScript adapter + Python executor + protocol version negotiation, which already handles 1|2) hidden inside slices described as "use the existing runner."

**Smallest repair:** add an explicit S4 or S5 item — "Extend the governance batch protocol with target kind/identity/OS/transport and stage binding; preserve v1/v2 acceptance" — and note it in `execution.md:91`.

### 6. The telemetry bounds cannot carry the evaluation the plan depends on — High

`measurement-and-qualification.md:28-31` bounds analytics at 7 days / 1,000 raw records / 1 MiB, with daily aggregates capped at **64 dimension combinations plus an `other` bucket**. `:106-119` then demands ~25 recorded dimensions (question/config/model version, mode, fallback reason, candidate/selected counts, two latencies, delivered bytes, expansions, corrections, target kind, transport, five stage durations, retry/reuse reason, intervention, accepted/reopened, usage coverage). At that cardinality nearly every combination lands in `other`, and the three-arm comparison (`:118`, decision-first plan `:267`) over 10–20 accepted tasks per arm (`:99`) will run well past the 7-day raw window before it completes. The data needed for the promotion decision expires before the decision.

The escape hatch exists — "explicitly enabled evaluation capture… Freeze useful cases separately from rolling analytics" (`:121-124`) — but no document says the arm comparison *must* use it, and the capture has no defined schema, bounds or retention.

**Smallest repair:** one sentence in `measurement-and-qualification.md:118` — "Arm comparison uses the evaluation capture, not rolling analytics; that capture declares its own retention and is exempt from the 7-day and 64-combination limits" — plus a named owner for its schema.

### 7. Sample size and benefit threshold are mutually inconsistent — Medium

`:99` sets 10–20 accepted tasks per condition. `:94-95` sets pilot targets of "25% less repeated context on resumed tasks and at least 10% lower median coordination cost." `:79-81` sets a planning envelope of 0–15% tokens / 0–10% elapsed time. A 10% median shift is not distinguishable from noise at n=10–20 on heterogeneous development tasks, and the decision-first plan `:327` correctly forbids retrofitting thresholds — which means the inconsistency must be resolved *before* the pilot, not after. The specs do say "report spread and limitations," but S3's and S7's exits are phrased as decisions ("fewer avoidable reads/reconstruction **where measured**", "qualify this bounded question or retain the deterministic path"), so an underpowered pilot produces an unresolvable exit.

**Smallest repair:** state in `measurement-and-qualification.md:99` that n=10–20 supports directional findings and hard gates only (correctness, required-proof coverage, decisive-evidence retention), and that any percentage claim requires a pre-declared effect size with a stated power assumption or is reported as inconclusive.

### 8. Five things are called a "packet" — Medium

- `resume` already returns a `packet` (`ops/continuity.ts:18`, budget 16 KB default / 64 KB max)
- the new "compact working packet" (`development-loop.md:106`)
- the "next-proof packet" (`development-loop.md:90`) — a *separate section of the same spec*, also "one bounded packet derived from existing task/plan/receipt data," overlapping the working packet's "pending jobs, known proof"
- governance's change packet (`src/project_governance_runtime/configuration.py:81`, `cli.py:172`)
- the research `spec.harness.context-packet`

And the plan defers the actual design question: "Its exact command name is an implementation choice" (`:105-106`). It is not. The working packet is `resume` plus discovery plus routing; whether it extends `harness resume` or adds a sibling command determines whether agents face one entry point or two — which is precisely the token cost this work exists to reduce.

**Smallest repair:** in `development-loop.md`, merge "Next-proof packet" into "Compact working packet" as a subsection, and state explicitly whether the working packet supersedes, wraps or coexists with `resume`.

### 9. `rg` is named as the discovery baseline but is neither used nor probed — Medium

`repository-discovery.md:13` — "Targeted Git/`rg` discovery is the initial baseline." No `rg`/ripgrep reference exists in `components/harness/src` or `src/project_governance_runtime`. Only Node/SQLite is probed (`continuity.py:16-30`), and `installation.md:47` lists no such prerequisite. What exists today (`ops/retrieval.ts:154`) is not search at all: it is `git ls-files` sliced to the first 40 paths **in alphabetical order** — so on any real repository, current candidate generation returns roughly `.github/…` through `components/…` and nothing else. The decision-first plan `:41-42` describes this accurately; `repository-discovery.md` does not.

Consequence: S3 candidate generation is entirely new code with no baseline to build on, and the packet's "deterministic ranking first" has nothing to rank.

**Smallest repair:** replace "Git/`rg`" with the concrete implemented mechanism plus a named prerequisite and doctor check if an external search binary is chosen; note in `repository-discovery.md` that `discoverPaths` is an alphabetical prefix, not relevance retrieval.

### 10. The 8 KiB evidence cap versus a 256 KiB delivery budget, with an unsatisfiable guarantee — Medium

`decision-interface.md:70-72` caps evidence at 8 KiB per question with "no silent truncation of decisive evidence." The artifact task ceiling is 262,144 bytes (`artifact.md:44`) and up to 40 candidates may be ranked — roughly 200 bytes, three or four lines, per candidate. "No truncation of decisive evidence" is not checkable before ranking: which evidence is decisive is what the ranking is for. Nothing binds candidate count ↔ excerpt bytes ↔ delivery budget, and "Oversized requests use baseline or an explicit narrower candidate query" leaves the narrowing rule undefined.

**Smallest repair:** define excerpt selection as a deterministic per-candidate byte allowance derived from the cap and candidate count; replace the unsatisfiable guarantee with "record the per-candidate excerpt bound and truncation count as a measured omission" — the plan already treats omissions as diagnostic evidence (`:128-130`).

### 11. A 1-second deadline will make the S7 comparison vacuous — Medium

`decision-interface.md:58-60` and the plan `:167` set a configurable 1-second interactive deadline with no retry, aborting transport on expiry. A remote LLM ranking call with an 8 KiB payload will frequently exceed that. S7's exit (`adoption plan:117-119`) requires "held-out quality and actual host outcome comparison" — but if the adapter times out most of the time, the arm measures the fallback path, not the adapter. Shadow mode is the natural place for a longer deadline since it does not affect the delivered packet, but no document distinguishes an evaluation deadline from the interactive one.

**Smallest repair:** one sentence in `decision-interface.md:58` — offline and shadow evaluation use a separate, longer, explicitly recorded deadline; only `auto` uses the interactive bound, and fallback rate is reported alongside every quality score.

### 12. Two undefined gates and one undefined store location — Medium

- **"disabled data sharing"** gates the adapter (`decision-interface.md:53`, plan `:161`). No data-sharing policy artifact exists — the term appears only in research and completed plans, and no governance configuration key implements it. The gate has no owner.
- **Cooldown state** must be "shared across CLI invocations by repository/provider configuration identity" (`decision-interface.md:64-67`) and "Persist only nonsecret cooldown state" (plan `:169`), but no spec says which store owns it. It cannot be the analytics DB (dropped on contention, `measurement:35`) and should not be the critical ledger.

**Smallest repair:** either name the configuration key and its owning spec, or replace "disabled data sharing" with "mode is `off`" and drop the second gate; and assign cooldown state to a named location in `operational-store.md`.

### 13. Handoff authorization line is self-contradictory — Medium

`docs/exec-plans/active/2026-09-19-continuity-agent-handoff.md:80-81`: "First implement S1's shared installation/health… then S2 measurement and S3 compact working packet… Runtime work must be within the current assignment; the latest task authorized specs/plans and secondary review only." The document's purpose is to start a new agent cheaply; its first instruction tells that agent to implement three slices and its next clause says implementation was not authorized. An agent will either stall or over-reach.

**Smallest repair:** separate the *sequence* (durable) from the *current authorization* (per-task), e.g. "Sequence: S1→S2→S3. Authorization for this task: specs, plans and review only; implementation requires new operator authorization."

### 14. `JEV_TOKEN=` is tracked in the repository for an unimplemented, default-off feature — Low

`components/harness/.env.example` is tracked and contains exactly `JEV_TOKEN=`. `installation.md:87` promises "Install, update, repair, doctor, task resume and ordinary execution require no JEV account or token"; a tracked `.env.example` implies the opposite to anyone cloning the module. `HOW-TO-USE.md` and `NIGHT-PROGRESS.md` are likewise tracked at module root outside the `docs/**` structure.

**Smallest repair:** remove `.env.example` until S7, or move the variable into `decision-interface.md` as documentation only.

---

## Optional simplifications (proposed, not prescribed)

1. **Collapse duplicated rules to one owner plus links.** The immediate no-token fallback rule is restated in 6 documents (plan `:154-171`, `decision-interface.md:48-73`, `installation.md:84-91`, `measurement:127`, adoption S7, `step-3`); the simulator-is-not-physical-proof rule in 8 (`development-loop.md`, `ecosystem-adapters.md`, `execution.md`, `measurement`, adoption S5/S6, `development-flow.md`, the plan, the handoff); shadow mode in 5. Every copy is a divergence site, and this duplication is itself the reading cost the work targets. Keep the normative statement in the owning spec; replace the rest with a link and a one-clause summary. Rough saving: several hundred lines across the set.

2. **Rename `auto` to `enabled`.** `decision-interface.md:50` defines `auto` as "explicitly enabled eligible questions use the configured adapter" — it is not automatic, and the plan `:156-157` says the same. The name invites exactly the misreading the design works hardest to prevent.

3. **Make the interface provider-neutral in its own text.** The spec is titled "Optional Decision Interface" and declares a provider-neutral boundary, then hardcodes `JEV_TOKEN` (`:52`) and names JEV throughout. Consider a per-adapter token variable declared at adapter registration; JEV then becomes one registered adapter rather than the interface's vocabulary.

4. **Give the handoff one reading list with a budget.** It currently splits required reading between `:31-40` (items 1–5) and `:92-93` (decision-interface, discovery), which overlap inconsistently — `development-loop.md`, `installation.md` and `measurement` appear in both. The combined set is ~1,900 lines (specs 699 + validation-strategy 329 + development-flow 137 + adoption 156 + plan 341 + hook taxonomy 60 + migration receipt 74 + indices). One ordered list with a stated line budget and an explicit "read on demand" tail would model the packet behavior the design is asking for.

5. **Consider deferring `shadow` mode to S7.** S3 only needs `off` plus a fake adapter for fixtures (adoption S3 says exactly that). Shipping three modes at S3 adds configuration surface before any consumer exists.

6. **Drop the sequential-canary idea from the plan** (`:200-201`). It is already hedged to near-nothing ("only where the runner supports it… may increase total latency; measure both effects") and is the kind of speculative item the charter's design principle says to remove until something demands it.

---

## Proof limitations

- **Documentation and planning qualification only.** No runtime behavior was executed, no tests run, no build performed. Every "implemented" claim I checked was verified by reading source, not by running it.
- **Source inspection was targeted, not exhaustive.** I read `ops/retrieval.ts`, `ops/continuity.ts`, `ops/execution.ts`, `cli.ts` (structure only), `provider_agents/{cli,jobs,protocol,test_batches}.py`, `continuity.py`, `telemetry.py` (limits only), `harness_integration.py`, `configuration.py` (packet references). I did not review `store/`, `model/`, `ops/{actions,adapter,authority,concurrency,governance}.ts`, or the test suite. Findings 4, 5 and 9 rest on targeted greps that returned no matches; a differently-named mechanism could exist outside the paths I searched.
- **Freeze verified, surroundings not.** All 17 candidate hashes matched, but I read several out-of-scope files (research trees, step plans, module-root files, governance policy docs) that are not hash-pinned and could change independently.
- **Not assessed:** whether Codex's actual host surface supports the lifecycle S1/S4 assume; whether any named adopter project's runner exposes the device ownership finding 4 requires; whether the 0–15%/0–10% envelope is plausible for these repositories; the correctness of the untracked `docs/research/**` content beyond its ID collisions and file-level divergence from the `components/harness` copy.
- **Not attempted:** any judgment about JEV's real request format, limits or latency. `decision-interface.md:73` correctly defers that to implementation time, and I have no basis to evaluate it.
