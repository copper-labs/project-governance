---
id: research.verification-feedback
title: Verification and Semantic Review Research
type: research
status: draft
owner: project-governance
created: 2026-10-04
updated: 2026-10-04
summary: Reconciles primary research on installed journeys, early checks, semantic review, mechanical rules and known-fault testing with the next major release.
---

# Verification and semantic review research

Research checked October 4, 2026. This covers each of the five accepted areas in the
[next major specification](../specs/engine-4-verification-feedback.md). Undated rolling documentation
is identified by access date, not presented as a new publication. Vendor examples and papers are
reported evidence, not independently reproduced results for this runtime. Source tests and installed
fixtures establish only their recorded boundaries; actual development benefit remains unmeasured.

## 1. Complete installed journeys

Codex gives SessionEnd handlers three seconds; handler failure cannot prevent the session ending.
Hook trust and native discovery are separate from correct files on disk. Its transcript file is a
convenience rather than a stable interface. These limits matter for cleanup proof and usage coverage.
[Codex hooks](https://learn.chatgpt.com/docs/hooks), accessed October 4.

The first new continuity fixture allowed more time than the installed hook declared. The corrected
fixture uses each handler's timeout and distinguishes termination from normal completion. A relabeled
copy of one payload proves generation separation, not migration between different implementations.
V5 therefore needs the exact published old archive and actual frozen major candidate.

Native hook-source discovery must qualify our observed main-checkout adapter behavior by host/version.
The supported directory-specific discovery surface is preferable to assuming every Codex host reads
the same file. Do not add another discovery service or promise arbitrary chat reattachment.
[Codex app-server](https://learn.chatgpt.com/docs/app-server), accessed October 4.

Claude distinguishes availability fallback chains from automatic switching after a flagged request.
An empty chain alone does not disable the second path. Its documented `switchModelsOnFlag: false`
makes non-interactive runs refuse rather than switch. Keep that refusal and exact model validation;
do not weaken safety or silently choose another model. This is version-qualified launch behavior,
not proof that administrator policy or every provider deployment has no other substitution path.
[Claude model configuration](https://code.claude.com/docs/en/model-config#ask-before-switching),
accessed October 4; category-based switching is documented from v2.1.219.

Claude startup configuration errors and retry events can explain apparent stalls even when a process
eventually exits cleanly. Bounded, sanitized retention in existing receipts is a useful follow-up.
Optional plugin failures must not become universal fatal errors. Required tool execution remains the
completion owner's job. [Claude headless operation](https://code.claude.com/docs/en/headless),
accessed October 4.

## 2. Earlier focused checks

Early checks earn their cost when they produce actionable feedback inside the existing workflow.
Google's experience supports that placement and warns against unhelpful findings; pre-commit explicitly
aims to catch simple mistakes before review. [Google static-analysis experience](https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/),
April 2018; [pre-commit documentation](https://pre-commit.com/), accessed October 4.

Pack path ownership is not application dependency analysis. A changed shared library, lockfile or
configuration may affect unchanged applications. Nx uses the project graph and Git changes for that
closure. Delegate it to the project's existing build owner or use conservative explicit pack scope.
The old and new paths of a rename both matter to owner selection.
[Nx affected tasks](https://nx.dev/docs/features/ci-features/affected), accessed October 4.

Captured packet creation does not prove an arbitrary compiler reads it. Custom commands run in the
project root; a tool ignoring the packet can read live bytes. Qualify changed-file packet adapters,
complete candidate/build inputs and live-checkout diagnostics separately. Gradle and Turborepo show
why source hashes alone are incomplete cache keys. Reuse their caches; add no Governance cache.
[Gradle build cache](https://docs.gradle.org/current/userguide/build_cache.html),
[Turborepo environment inputs](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables),
accessed October 4. [Build Systems à la Carte](https://simon.peytonjones.org/build-systems-a-la-carte/),
ICFP September 2018, separates dependency scheduling from rebuild decisions.

An external green status need not mean a required job ran: GitHub documents skipped jobs reporting
success. Local CI tools also have fidelity limits. Any adapter needs original required receipts,
explicit not-run/blocked states and its declared environment; local success is not hosted equivalence.
[GitHub status checks](https://docs.github.com/en/pull-requests/reference/status-checks),
[act limitations](https://nektosact.com/not_supported.html), accessed October 4.

## 3. Multilingual semantic review

JEV can answer several named questions over shared state, reducing repeated transport. The vendor's
September 2026 parallel-question example uses Jev 1.12, one article and thirteen questions; it does
not establish multilingual code-review quality. Batch compatible questions once, and measure the
entire task rather than treating a cheaper request as a saving.
[Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions), accessed October 4.

TypeSafe's Jev 1.13 limits page, reviewed October 2, describes negation/literal reading, indirection,
irrelevant and adversarial state, contradictory criteria and Choice-order sensitivity. Add controlled
variants to a small frozen evaluation. Filtering irrelevant review evidence is different from silently
excluding eligible repository paths before content retrieval; retain capture/selection coverage.
[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

Confidence summarizes the answer distribution; it is not independent proof of truth. Vendor workflow
evaluations assume the harness is correct and use model-derived reference judgments. Neither establishes
our harness correctness or DL01/DL02 defect detection across Kotlin, Swift, Python and JS/TS.
[Confidence](https://docs.typesafe.ai/confidence), [workflow evaluations](https://evals.typesafe.ai/),
accessed October 4.

Start with five frozen cases per stack: meaningful test/correct change, mock-only assertion, weakened
assertion allowing a known fault, missing setup requiring unknown, and a legitimate intentional change
that must not produce a false finding. Add a few negation, reordered-choice, embedded-instruction and
unrelated-hunk variants. Compare isolated and compatible batched questions on identical evidence.

Freeze expected semantic applicability and labels before calls. Labelers see the same captured evidence
as JEV. Separately retain executed behavior witnesses. Report total cases, intended defects, sufficient
captures, omissions, unknowns, uncertain/invalid/unavailable answers, useful findings, misses and false
findings. An omitted expected defect is an end-to-end miss; also report quality conditional on sufficient
evidence. This first comparison characterizes behavior; it does not fit thresholds or prove savings.

Use an offline manifest referencing existing subject, capture, question/model and decision receipt
identities, label source, intended failure, check receipt, coverage limits and available usage. No new
collector, online duplicate judge or provider consumer is needed. Missing usage remains unknown.

## 4. Repeated mechanical findings

Prefer existing syntax-aware rules, such as ESLint restricted imports or Ruff banned APIs, over regex
or extra model calls. A custom rule needs valid and invalid examples and a stable finding identity.
Neither cited rule proves every indirect loading or behavior property.
[ESLint rules](https://eslint.org/docs/latest/rules/no-restricted-imports),
[Ruff banned API](https://docs.astral.sh/ruff/rules/banned-api/), accessed October 4.

A baseline can mean only that violation counts did not grow. ESLint's file/rule-count suppression
mechanism can hide replacement of one old violation by a new violation with the same count. Detekt
uses rule/signature identities, with its own limits. Qualify unchanged debt, same-count replacement,
rename/deletion and changed configuration before claiming no new violations. Do not silently regenerate
baselines or introduce a second baseline authority.
[ESLint suppression source](https://github.com/eslint/eslint/blob/main/lib/services/suppressions-service.js),
[Detekt baseline](https://detekt.dev/docs/1.23.8/introduction/baseline/), accessed October 4.

## 5. Known-fault proof

Mutation research supports a few meaningful faults with concrete behavior witnesses. Just et al.
studied 357 real faults in five Java applications; coupling and correlation were useful but incomplete.
Google's experience favors changed-code selection and filtering for actionability. Neither establishes
that a few seeds prove general test adequacy.
[Real-fault study](https://homes.cs.washington.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf),
FSE 2014; [Google mutation experience](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/),
TSE 2021.

Require good → deliberately bad → corrected behavior through the same entry, with the intended
failure identity. A compile error, missing runner, unrelated assertion or incidental timeout does not
prove the target defect was caught. Some tools count timeout as detection, which is too broad unless
the seeded behavior itself is a hang. [Stryker states](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/),
accessed October 4. Keep stack mutation tools project-owned; JVM results do not establish KMP Native,
JavaScript or physical-device behavior.

## Reconciliation and stopping point

Incorporate now: honest multilingual capture counts, intended-fault identities, actual hook deadlines,
old/new rename ownership and explicit fixed-model launch settings. Qualify at release: real old/new
archives, installed batch-to-review entry, native discovery/trust, tool input fidelity and selected
baseline/affected closure. Characterize semantic accuracy separately with the frozen matrix.

Defer a universal graph/cache, mutation service, duplicate live judges, automatic chat relocation,
threshold fitting, per-edit/full-suite hooks and broad model routing. These add owners or recurring
cost without closing the reproduced gaps. The accepted spec and plan own implementation; this note
does not grant enforcement or publication authority.
