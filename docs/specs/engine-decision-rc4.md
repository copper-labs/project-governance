---
id: spec.engine-decision-rc4
title: RC4 Evidence Selection, Quality Evaluation and Category Routing
type: spec
status: current
owner: project-governance
created: 2026-09-21
updated: 2026-09-22
summary: Defines RC4 evidence selection, requirement-linked quality advice, operator-defined task categories and model bindings, fixed defaults, and bounded local-CI advice.
---

# RC4 evidence selection, quality evaluation and category routing

## Purpose and ownership

Make ordinary development reach the existing decision layer, assess work against its actual
requirement, and route eligible new assignments without asking the coordinating LLM to choose a
model each time. Improve local-CI recommendations using meaningful scenario descriptions. The
operator defines task categories and their model/effort bindings; JEV classifies the work and code
applies that mapping. It does not discover or rank models. Fixed-model operation remains the default.

This is the implemented RC4 contract. Publication and adopter activation are separate steps;
source presence does not establish either.
The [delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#rc4-quality-routing-and-ci-batch)
owns R0–R6 order and progress. The [shared contract](engine-decision-layer.md) owns modes,
budgets, evidence scope and provider fallback; the [consumer catalog](engine-decision-use-cases.md)
owns DL01–DL13. This specification bounds RC4 additions and integration of existing consumers.

No adopter profile changes merely because these documents change. Existing installed behavior
continues until deliberate release adoption. Target identities, private examples, model bindings,
runtime results and commercial usage remain outside this reusable checkout.

## Source baseline and release scope

The implementation baseline was `3.0.0-rc.3`. Its source has ten consumers: the eight original advice
and text-selection consumers, DL06 attention advice, and DL12 selected-history analysis. DL05 also
supports qualified read-only diagnostic selection. Source presence does not establish host exposure,
semantic accuracy, token savings or qualification of another platform.

| Area | Current owner and behavior | RC4 addition |
| --- | --- | --- |
| Model selection | Installed `resources/model-selection.md` asks the coordinator to choose a work-class row; `provider-binding.ts` accepts explicit values or a caller-selected binding file | One optional routing owner before an already authorized new provider submission; fixed baseline when routing is off |
| Model availability | `provider-doctor.ts` resolves the executable and binding; authentication and native model capabilities are not probed | Honest candidate qualification and actual dispatch identity; no claim that executable discovery proves account/model access |
| Delegation route | Shared skills prefer governed wrappers, while native host tools and direct CLIs may also exist | Required governed entry for the selected pilot; host enforcement coverage and bypass evidence are explicit |
| Evidence delivery | `context-route-command.ts` and `decision-output-advice.ts` already select optional context/output | Reach one ordinary caller before the worker reads the content; measure delivered content and later retrieval, not just classifier calls |
| Code/test review | `decision-review.ts` captures bounded evidence and batches compatible DL01/DL02 questions | Requirement-linked quality questions and reuse across meaningful completion boundaries |
| Completion claims | `decision-provider-advice.ts` and `decision-claim-advice.ts` inspect supplied report/evidence | Join the original requirement, changed subject and applicable native proof when available |
| CI advice | `decision-validation-advice.ts` supplies optional pack recommendations using paths and structural metadata; timing history is unavailable | Adopter-authored scenario meaning and evidence-linked recommendations; execution remains unchanged |
| Measurement | `decision-episodes.ts` records workflow episodes; existing decision/outcome readers join receipts | Check and provider-assignment episodes, selected versus actually used model, and missing-exposure reasons |

RC4 ships connected evidence selection, quality advice, optional category-based routing of new
assignments, and richer CI advice after their shared boundaries are qualified. New consumers,
questions and execution effects require opt-in. RC3 question and inference defaults remain unchanged;
RC4 adds bounded local entry-exposure receipts even when inference is off, so the measurement can
include disabled and fallback paths. These receipts do not themselves trigger model calls or cloud disclosure. Caller wiring may reach an already enabled DL03/DL13
under its existing settings and shared budget; it cannot enable a disabled consumer or broaden data
scope. Active context/quality features do not require live model routing. For routing,
start with a fixed model or explicitly requested shadow classification; enable category dispatch
only by deliberate choice. Compare each feature's effects separately before claiming a combined benefit.

## Research reconciliation and delivery emphasis

The [September research reconciliation](../research/2026-09-21-jev-agentic-development.md) distinguishes
working examples from unreplicated benchmarks. Its main implication for this design is to select
useful evidence before expensive reading, classify observable work instead of guessing model ability,
and assess total accepted-task cost. The [simplification pass](../reviews/2026-09-21-rc4-simplification.md)
records smaller implementations and optional reductions without removing useful extension points.

### Reach the existing context and output consumers

Start with a code-owned compact presentation at high-volume native boundaries. Terminal
`check-status` returns the existing summary shape inside its status envelope by default; `--full`
returns the complete retained result. Keep run/state/status and exit codes, all blocking/advisory
finding identities, blocked packs, command failures and cleanup uncertainty. Finding messages over
4096 bytes use a labelled head/tail excerpt with access to the complete original; an authored finding
can itself contain a raw stream. Ordinary shorter messages stay intact. Presentation failure reports
an unavailable summary without changing the native exit code. Include the original result
path and canonical-JSON digest so fuller inspection remains possible. Persisted native results and
internal observation APIs stay complete. This deterministic default is separate from optional JEV
selection; it works without a token and does not change which checks run or pass.

Use the existing source capture, lexical shortlist and DL03 optional-context selection before a
supported provider assignment assembles its prompt. Preserve mandatory rules/evidence, stale-source
checks, source permissions and the full retrieval references. Missing candidates are a retrieval
coverage limit; JEV cannot select a file it never received. Low relevance is not authority to discard
known contradictory evidence. Do not compact or rewrite a live conversation to obtain this effect.

Reach the existing DL13 output projection through that caller's ordinary completion/observation path.
Also connect a bounded governed command/check output delivery point; provider-completion selection
alone does not select raw build/test logs. Bind task/revision and approved diagnostic disclosure at
that boundary. Do not add a model call to a passive telemetry/status read merely to record exposure.
Retain native outcomes, required warnings, failures and cleanup evidence. Record selected/omitted
content and whether it was actually delivered. Count later expansion reads where the governed caller
observes them; unobserved host reads remain unknown. Fewer packet bytes alone do not prove fewer
total tokens or accepted-task savings. Off/shadow/missing-token behavior preserves existing delivery.

This is caller wiring and proof of existing consumers, not another retrieval service, deep source
index, MCP plugin or output-selection engine. Existing DL04 procedure advice can share that captured
context when applicable; no new per-turn skill selector is required. Mandatory procedures remain
code/policy-owned, and no suitable optional procedure is a valid result.

### Immediate operational repairs

The field findings justify explicit approval-identity transport, recovery of exact detached-check
readers after independently confirmed cleanup, an adapter-owned emulator capacity preflight, and
supported exact-target resource cleanup observation. These reuse current execution and registry
owners. No classifier grants approval, deletes device data, releases an uncertain owner, or changes
a failed result into a pass. Keep generic contracts here and private targets/receipts in the external
pilot record. The delivery plan owns the repair checklist and focused proof.

Implement these repairs and R0a/R2a before optional category dispatch. Keep the same coding model
while first measuring delivered evidence, expansion reads, total usage, rework and accepted outcome.
The remaining RC4 scope is retained; this is a dependency/order change, not a smaller release scope.

## Model selection: one owner, routing off by default

The current Markdown table is model-selection guidance interpreted by an agent, not an executable
JEV router. Disable that automatic work-class choice in RC4's installed guidance. Preserve explicit
operator choices and fixed provider bindings. Do not replace it with a second agent-interpreted
table that competes with the runtime router.

| Situation | Required behavior |
| --- | --- |
| Operator supplies a model, effort or provider through a trusted task/configuration binding | Preserve every explicit field. Resolve only compatible missing fields from the fixed binding; no JEV substitution |
| New job; routing off or omitted | Use the caller-selected fixed provider binding; do not classify difficulty or choose from the old table |
| Routing shadow | Record a task category and its configured binding, dispatch the fixed baseline, and record that the mapping was not used |
| Routing auto with advice effect | Deliver category advice; dispatch the baseline. Advice is not permission to change models |
| Routing auto with explicit `route-model` effect | Classify into an operator-defined category; code applies its preselected eligible model/effort pair within the already selected provider |
| JEV absent, timed out, invalid, uncertain, out of budget, or evidence unavailable | Use the previously resolved fixed baseline without an extra LLM choosing a fallback |
| No complete compatible baseline | Return a clear configuration error before transport or job launch; never guess a model |
| Selected explicit model unavailable | Preserve the failure. Never silently substitute another model, provider or access route |
| Existing conversation or provider follow-up for the same assignment | Preserve its recorded model/effort and native session identity; a new requirement or assignment class needs a new submission |
| Agent supplies its own model choice to avoid an enabled route | Reject the unbound override in a governed assignment; an argument is not evidence of an operator choice |

The user can still choose different models manually with routing disabled. What is disabled is
automatic reassignment. A configured baseline may differ by provider, but task difficulty does not
change it. The running parent retains its host settings; RC4 cannot switch a native conversation
through a control the host does not expose.

The ordinary task uses one coding agent on its fixed host model. Category advice does not initiate
delegation. A second model or subagent is used only for an operator-requested assignment or an
existing project-owned required review. The optional governed provider path controls such covered
assignments; a top-level host with unrestricted native tools needs its own qualified tool controls
before we can claim that unrequested delegation is blocked.

### Required governed delegation and feature exposure

When the selected RC4 pilot delegates, it requires the governed submission path for agent-initiated
model work. The pilot does not require delegation on every task.
This requirement is independent of DL08's mode: with routing off the same path dispatches the fixed
baseline; with routing on it runs selection or records an allowed fallback. An agent cannot choose
another CLI, native subagent tool, helper, provider API or nested worker merely to bypass that path.
Calling the required path does not mean JEV must be available or must return a usable answer.

Reuse the existing task/action authority and trusted host admission boundary. Bind a
`governed-delegation-required` constraint, approved route, model baseline, explicit operator overrides,
decision profile digest and required feature coverage to the authorized assignment. This is a
constraint on already authorized work, not permission to spawn an agent or a new approval ceremony.
Child submissions inherit these admission constraints and cannot expand them at the governed entry.
This does not confine an already running process. Existing workers use broad native permissions
(`bypassPermissions`, `dangerFullAccess` or `always-proceed`); their prompt constraints are not a
sandbox. Classify that existing path as admission-only and outside runtime enforcement coverage.
Existing single-coordinator/no-unrequested-nested-delegation rules remain in force.

Only a trusted host integration or previously accepted operator configuration can establish an
explicit override. A model-written `source: operator` field, prompt assertion, raw `--model` flag or
edited profile is not authority. Explicitly requested independent reviewers still use the governed
path with an attributed override and ordinary evidence collection; JEV cannot change their model.
If a host cannot bind an operator choice, use a preconfigured reviewed binding or report the gap.
Use the existing harness task/action record, reached through the trusted host API's
`proposeAction`/`authorizeAction`, as the provenance carrier: an existing `record` operation with
`destination: null`. This records provenance, not permission for provider dispatch. RC4 adds no
harness operation, destination or broader authority policy; provider admission still owns dispatch.
A digest detects changes but does not
authenticate an operator. A worker able to rewrite the policy, authority store or host integration
can forge this evidence; it remains outside enforcement coverage until host controls prevent that.

At adoption, inventory each available delegation entry and label it enforced, adapted, disabled,
or outside coverage. Wire the supported host's existing tool permissions/hooks to redirect or deny
unmanaged delegation, including child/native delegation, rather than relying only on Markdown.
Do not claim that shell command-name matching confines arbitrary scripts or direct network calls.
An unrestricted shell/network route without an enforceable host boundary is outside coverage.
Required-governed pilot admission is unavailable on that host until the gap is resolved or the
operator explicitly chooses a clearly labeled non-enforced comparison. Never silently downgrade.

The first candidate is Claude Code's native restricted mode with protected tool permissions.
The installed host and [official CLI contract](https://code.claude.com/docs/en/cli-reference)
provide `--restricted` (v2.1.248 onward), `--safe-mode`, a narrow tool list and strict MCP controls.
Use these existing controls instead of making a shell `PreToolUse` hook the enforcement owner:
[command hook timeouts can fail open](https://code.claude.com/docs/en/hooks), so a hook alone is
insufficient. This implementation choice still requires native denial proof before qualification.
Start with one bounded read-only assignment class: the trusted host submits the job, and
the worker receives only the native read/search tools it needs. Disable native agent spawning,
general shell execution, network and unapproved MCP/tools for that class. A narrow tool allowlist
is simpler to qualify than inspecting arbitrary scripts. Never silently strip tools required by
an assignment: an incompatible assignment is ineligible for this path.
The pilot's routable `assignment_classes` must be a subset of the qualified guarded worker classes.
The submitting coordinator remains admission-only unless separately confined; qualifying a child
class that is never routed does not satisfy this requirement.

Bind the guarded permission/tool profile into native launch and continuation identity; the current
full-access identity checks must recognize this explicit profile rather than weakening validation
globally. Resolve trusted admission and provider configuration files outside the workspace, all additional
roots and the provider job directory; the worker must have no write access to them. Restrict reads
to approved source roots and deny credential reads. Protect authority evidence from worker writes.
If a later class needs shell execution, qualify the host's supported process/network sandbox and
disable unsandboxed escape; command-name filtering alone does not suffice. No custom sandbox or
general model gateway is part of RC4.

Governance owns reusable adapter code and a policy proposal. The operator owns installation of
adopter/managed settings; package upgrade must not rewrite them or change machine-wide policy.
Inspect the actually loaded settings and host version, then prove denials of unmanaged delegation
and policy tampering. Evidence includes engine-owned launch argv/settings bytes, host settings
readback and observed denial events. The child's reported permission string detects identity drift;
it does not independently prove confinement. A cooperative worker or adapter fixture alone is insufficient. The first
qualified claim covers this launch boundary and guarded worker class, not every developer session.
An unrestricted parent/coordinator remains admission-only or outside coverage; downstream controls
must not be advertised as controlling that parent. Keep that gap explicit in pilot eligibility.

For each assigned check, quality or routing opportunity, the existing completion/outcome boundary
requires either the actual governed receipt or a code-produced reason such as explicit override,
consumer off, not applicable, missing token, budget exhausted, unsupported input or provider failure.
Missing receipt is `coverage-unknown` or a route violation, not successful exposure and not a zero-cost
baseline. Enforced assignments cannot claim complete governed execution while that evidence is missing.
This validates entry and evidence; no JEV judgment becomes a new correctness or merge gate.

Freeze the effective operator-approved profile for the assignment. Keep `profileDecisionSettings`
pure: extend its `configDigest` with the parsed `continuity.model_routing` declaration. At provider
submission, separately compute and freeze an assignment `bindingDigest` covering approved config
realpath/content, resolved executable identity, guarded host profile and operator constraints. Do
not add filesystem/provider discovery to the profile parser. Bind both identities into the request;
the current decision digest alone does not cover a sibling routing declaration. Workers may propose profile
changes but cannot apply a new effective mode, shrink an
allowlist, drop task identity or change the approved route to evade an assigned feature. Legitimate
operator changes create a recorded new policy binding; attempts to alter the effective policy fail
admission rather than masquerading as ordinary provider-free fallback.

Reports distinguish reached, called, delivered, used, authorized fallback, explicit override,
outside coverage and attempted bypass. Retain all assigned work in the primary outcome totals,
including budget exhaustion and other fallback. Separately report the subset actually routed or
exposed; never present a no-exposure result as evidence of classifier quality. Contaminated or
unmatched work cannot support a causal savings claim, but must not disappear from the totals.
Repeated fallback, absent task bindings or unexpected alternate-model use must be visible without
reading every governed agent transcript. Exposure ratios cover assignments reaching that entry.
Off-entry CLI/API use by an unrestricted coordinator is unobservable here: report the inventory gap,
not zero bypasses or complete coverage. Loss of the required governed entry stops that assignment visibly;
it never authorizes a direct CLI escape. JEV unavailability still permits a valid governed baseline.

### Configuration and legacy migration

`continuity.decisions.consumers.DL08.{mode,effect}` is the only routing activation switch, bounded
by the existing global mode. Omitted mode means off and omitted effect remains advice. Register
`route-model` only for DL08; it authorizes selection within an existing submission, not delegation,
worker steering, tools, credentials, publication or additional jobs.
`choose-local` retains its distinct local workflow/recovery meaning and is not a model-routing alias.

Add a typed `continuity.model_routing` declaration for eligible assignment classes, operator-defined
task categories and their preselected candidate bindings. It contains no second mode, retry ladder,
pricing service or expression language. The existing caller-selected provider configuration owns
the fixed baseline and executable.
Each category contains a short bounded `description` and one exact `model`/`effort` pair; the provider
comes from its enclosing declaration. Keep one category map, not separate model and category
registries. There is no pool to rank within a category.
Do not ship a global ranking, model-capability predictor or automatic model recommendations.

Illustrative proposed RC4 profile fragment. RC3 ignores a sibling `model_routing` block; it does not
activate routing. RC3 rejects the new DL08 consumer, `questions` keys and `route-model` effect when
encountered in decision settings. Migration inspection must distinguish ignored from rejected input:

```yaml
continuity:
  decisions:
    consumers:
      DL08:
        mode: off
        effect: advise
  model_routing:
    providers:
      claude:
        require_governed_entry: false
        assignment_classes: [bounded-summary]
        categories:
          summarize-evidence:
            description: Summarize supplied evidence without diagnosing causes or proposing changes.
            model: project-configured-model
            effort: high
```

`project-configured-model` is a placeholder for an actually supported project choice. The fixed
baseline is derived from the selected provider binding, never maintained as a second default here.
`unknown` is a classification result, not an executable candidate. Reject duplicate/reserved IDs,
empty descriptions, unsupported providers, malformed pairs and unknown keys. An empty usable
mapping resolves to baseline. Category definitions are versioned through the
configuration digest. The trusted assignment class bounds tools/permissions; the classified task
category describes work within that class and cannot expand it. Model pools within a category,
dynamic price rankings and automatic escalation are deferred. Initially qualify one provider, one
guarded assignment class, and a baseline plus one alternative; the declaration can support more later.
To activate live selection, the operator explicitly sets both DL08 auto and `route-model`, with a
permitted global ceiling and qualified candidates. Enabling another JEV consumer never enables DL08.

`require_governed_entry` is an independent host admission requirement, default false. It does not
enable routing. When true, even a fixed-model or provider-free assignment needs trusted admission.
Outside that pilot, enabling shadow/advice must not accidentally disable existing explicit jobs.

Preserve tracked `config/governance/model-selection.md` files. Do not parse their prose into
execution policy, overwrite them during installation, or treat an old work-class table as routing
consent. Migration inspection reports the legacy file and proposes which fixed binding and optional
candidates to retain. The adopter reviews that proposal before routing activation. Contradictory
project instructions remain an explicit migration issue; a router cannot override them. Explicit
task selections still work while routing is unavailable. Existing RC3 installations are unchanged.

Update the single installed model-selection resource and its planning/delegation references in the
same implementation slice. It must explain fixed defaults, explicit overrides and the typed routing
owner, rather than instructing the coordinator to run the old selection table as well. The legacy
Python helper continues accepting explicit/configured bindings; it does not acquire a second router.

### Submission and selection contract

Extend the existing file-backed `provider-submit` request with `decision` task context and an
optional `admission` reference. Task context contains the accepted `taskId`, `revision`, requirement,
acceptance criteria and source paths; the trusted admission supplies `assignmentClass`. A verified host binding supplies identity where available;
manual submissions may provide it explicitly, with conflicts rejected. This context supplies inputs,
not authority to delegate or enable routing. Keep required provider, workspace, structured assignment,
access, tools, deadlines and ordinary process admission unchanged.

For a required-governed assignment, top-level `model` or `effort` fields must match a trusted explicit
override or the frozen fixed binding; an older caller's table-derived values cannot bypass routing.
A match to the fixed baseline is only a baseline hint, not an explicit override: enabled routing
still runs. Reject an unbound alternate pair with one actionable finding. A routed caller omits those
fields and names the approved `config` file containing its complete fixed provider binding. Keep the
raw explicit-binding behavior for installations outside the enforced pilot, but label it separately
and never count it as routed exposure. No ambient current-task file or inferred prose identity is
introduced. Selection provenance must not be inferred from the mere presence of arguments.

In a required-governed request, `executable` must be absent. Resolve it only from the frozen approved
binding, and require `config` to match that binding's realpath and content digest. The trusted host
also fixes the coordination registry, access, roots, required tools and credential/environment
scope; caller fields may neither replace nor broaden them. Reuse existing provider compatibility
validation in `providerBinding`, not a second model/effort validator. A shim reporting the expected
model is not proof of the approved executable.

Before classification, look up the durable job identity. If `request.json` exists, an identical
replay reuses its frozen category, pair and receipt without a JEV call, then reconciles through the
existing lifecycle owner. If the directory exists without `request.json`, retain the existing
unresolved-submission error before calling JEV. Reconcile ownership before deliberately retrying
with a new job identity; count any additional decision cost. RC4 adds no new recovery transaction.
Compare the original submission and authority identities before applying the derived routing fields;
changed input under the same job ID is rejected. Recheck current authority before any not-yet-started
dispatch; policy drift must not cause a fresh selection disguised as replay.

1. Resolve the native provider, trusted explicit locks, complete fixed baseline, required-governed
   constraint and existing assignment authority. Missing or contradictory binding fails before a
   JEV request. Ordinary agent-selected arguments do not become operator locks.
2. Resolve workspace/task/revision, source-sharing scope, configuration and caller capability.
   Enforce destination permission before sending any evidence to JEV or a coding provider.
   Check mapped pairs in code against assignment class, provider, capabilities, explicit constraints
   and qualification evidence. A model cannot declare itself eligible or grant source access.
3. Ask versioned Choice question `assignment.category/1` about the bounded requirement and observable
   work, using the operator's category IDs/descriptions and an explicit unknown option. Do not ask
   which model is strongest/cheapest, expose model names/prices as classification cues, or force a
   difficult task into a simpler category because a binding is unavailable. Missing/mixed evidence
   can return unknown. Trusted operator model locks bypass this classification.
4. Interpret uncertainty using thresholds qualified for this Choice question, not Noul cutoffs or
   a claimed probability of successful task completion. Code looks up the fixed binding for that
   category. An unavailable/ineligible mapping or uncertainty uses the authorized baseline; it
   never searches for another model. Revalidate configuration,
   evidence and candidate eligibility immediately before dispatch. Changed applicability falls back
   to the still-valid baseline; changed authority, baseline or category mapping fails admission.
5. Freeze the resolved pair and selection receipt into the existing durable provider request.
   The native provider binding and executor perform ordinary admission and dispatch. Verify the
   actually reported model/effort using the existing provider identity rules.
6. Record the outcome, usage, repairs and acceptance separately from JEV's recommendation.

The first live route stays within one already selected provider. Cross-provider routing changes
authentication, tools, data destinations and host capabilities; it is deferred. Bootstrap a candidate
through an explicit operator-authorized qualification assignment using the same governed entry and
an attributed fixed-model override. This does not depend on DL08 already selecting that candidate.
Retain successful native proof in existing provider receipts/episodes, bound to the exact pair,
executable, permission profile and required capabilities; requalify when that evidence no longer
applies. Declaration alone is recorded as declared, not successful capability proof. Discovery may
replace a probe only if its supported interface and evidence actually establish the needed capability.
Unknown capability is not eligible for automatic selection. A later capability failure makes the
pair ineligible until repaired/requalified; it does not start a replacement job automatically.

Keep ordinary `provider-doctor` binding checks unchanged. An explicit `--workspace` plus bound
assignment input requests routing preflight: show effective policy, coverage and candidate evidence.
Missing JEV or unqualified optional candidates are reported fallback conditions; an invalid baseline,
contradictory authority or missing required host boundary is a nonzero preflight result. Doctor makes
no paid qualification call by default and does not equate executable discovery with model access.

Bind the decision to assignment ID/content, task/revision, source snapshot where applicable, category
mapping, fixed baseline and policy/configuration digests. Repeating a durably recorded submission
reuses its decision and existing job identity; it must not duplicate a charge or worker. A changed request
under the same immutable job ID is rejected. Do not hold a SQLite transaction while calling JEV.

Failure before any alternative worker starts may use the authorized baseline only when the absence
of execution is known. A started, failed or unknown worker retains its native result and cleanup
ownership; no automatic second job follows. A later authorized escalation is linked to the original
assignment and total cost. Automatic produce/verify/retry cascades remain outside RC4.

A continuation binds the original assignment ID, requirement/acceptance digest and class. New scope
requires a new authorized submission; reject a changed identity/class through `provider-follow-up`
in an enforced assignment. Outside that boundary, label such work outside-routing. Do not ask JEV
to certify that arbitrary new prose is the same task. The host supplies the bound continuation
scope; an unbound caller cannot claim it. Preserve the original scope for completion evaluation and
count unsupported attempts, rather than silently exempting all follow-ups from routing exposure.

## Quality evaluation at meaningful milestones

Extend existing check and provider-completion projections; do not add a background evaluator,
independent agent loop or new completion gate. Run once for a changed, eligible evidence snapshot,
and reuse the result on repeated status/wait observations. Off means no new semantic call; shadow
records only; auto/advice delivers a compact set of concerns without changing native outcomes.

Capture a bounded packet containing the explicit requirement and acceptance criteria, immutable
changed subject, relevant implementation/test excerpts, applicable check receipts and the claimed
completion scope. Every field has provenance, sharing permission and an identity. The provider's
own report is a claim, not proof. Code owns result status, source freshness, test identity, platform,
cleanup and whether a receipt applies. Missing input remains missing; unrelated successful proof
must never be promoted into support.

| Question | Owner | RC4 treatment |
| --- | --- | --- |
| Does the supplied change address this supplied requirement? | DL02 | Add atomic Choice `change.requirement-support/1`: supported, partial, contradicted, unknown; a semantic assessment, never acceptance |
| Does this test assert the requested behavior? | DL01 | Add atomic Choice `test.requirement-support/1` over the test and captured setup; execution and regression sensitivity remain separate evidence |
| Is this completion claim supported within its claimed scope? | DL09 | Reuse existing claim questions and exact receipt applicability; enrich captured evidence without rerunning equivalent judgments |
| Did a repeated attempt add useful information? | DL12 | Use selected completed episodes and existing work classification; report uncertainty, no live worker interruption |

Do not reduce the result to one overall quality number. Return question/requirement IDs, supplied
evidence references, coverage limits and concerns through the existing compact advice renderer.
Preserve original native results. Advice may focus an already required review, but cannot waive it,
force a broad test run, edit a test, accept a task or approve a release.

New quality questions require explicit opt-in even where a consumer was already auto. Add an
optional exact `questions` allowlist to each consumer declaration. Omission preserves that consumer's
RC3 question set via frozen per-consumer `defaultQuestions` in `decision-catalog.ts`, not the growing
catalog's `questions` list. Pin those defaults from the inspected RC3 catalog in implementation proof.
The exact frozen sets are:

| Consumer | RC3 default question IDs |
| --- | --- |
| DL01 | `test.assertion-support/1`, `test.mocked-behavior/1`, `test.expectation-weakened/1` |
| DL02 | `diff.rule-concern/1`, `diff.task-relevance/1` |
| DL03 | `context.relevance/1` |
| DL04 | `workflow.match/1` |
| DL05 | `runtime.diagnostic-match/1`, `runtime.next-probe/1`, `runtime.next-probe/2` |
| DL06 | `iteration.attention-needed/1` |
| DL07 | `validation.scenario-relevance/1`, `validation.coverage-gap/1` |
| DL09 | `claim.support/1`, `claim.completion-scope/1` |
| DL12 | `episode.work-class/1`, `episode.procedure-match/1` |
| DL13 | `output.keep-block/1` |

Both existing DL05 probe versions stay in that set; entry/effect admission still determines which
applies. Legacy `legacy.context-rank/1` migration remains separately owned and unchanged.

An explicit list selects only registered compatible definitions. New DL08 is off
by default and uses its initial registered question when explicitly enabled. Bump a question version
when meaning or evidence interpretation changes; upgrades never silently enable added definitions.
Empty lists produce no semantic transport. Invalid or incompatible definitions fail configuration.
The allowlist selects question versions; entry/effect compatibility remains a separate admission
check, not another automatic version selector.

Use the current DL01/DL02 capture and batching owner. Reuse a completed answer only when question,
evidence, scope, configuration and applicability match. Batch independent questions only with
compatible data scope, modes and deadlines. DL09 may join a batch when its proof is already present;
do not wait for future evidence or merge task identities to save a request. Native provider usage
is counted once, regardless of the number of consumers receiving that batch.

Source support begins with the currently qualified parsers and captured text boundaries. Missing
setup, unknown dynamic behavior, unsupported language or truncated evidence produces limited/unknown
coverage. No deep source index, universal language parser or automatic mutation-testing service is
required. Reuse cheap existing regression proof where it is available.

## CI recommendations with meaningful context

RC4 extends DL07 advice, not the executor or merge gate. Add bounded optional decision metadata to
the existing pack declaration: `decision_context` with `purpose`, `covers` and `limits`. These are
source-scoped descriptions of existing checks, not commands, applicability rules or execution grants.
Capture the relevant requirement and changed behavior alongside exact native applicability facts.
Reuse existing descriptions first; add this optional block only where they leave a useful gap.
Do not require authors to rewrite every pack before the pilot.

Version the changed evidence interpretation as `validation.scenario-relevance/2` and
`validation.coverage-gap/2`, enabled through the explicit question allowlist. Retain the earlier
questions for existing profiles until deliberate migration. Do not operate two competing live
implementations: one consumer prepares the selected version against its declared evidence contract.

Code supplies required checks, dependency order, known platform capability and applicable native
results. JEV ranks eligible optional scenarios and flags a gap only within the supplied catalog.
Existing measured durations may inform a deterministic recommendation order; absent durations,
failure history or complete dependency closure stay unknown. Do not build a history warehouse or
invent a coverage graph to make an early recommendation look complete.

Return recommended optional IDs, coverage concerns and the next eligible validation recommendation
with evidence links. A caller can use these in an already authorized workflow, but this RC4 feature
does not dispatch extra checks, reorder the executing mandatory plan, omit required work or establish
that a passed result can be reused. Applicable local and remote CI have identical proof obligations.
Actual `shape-plan`, machine placement, predictive omission and adaptive dispatch remain later DL07
effects. Do not advertise faster builds solely because advice was produced.

Prioritize expensive optional integration/device scenarios as the research target; retain cheap
deterministic checks. Join recommendations to already-required completed runs when source, pack and
input identities match. Report a failed pack that advice would have omitted or deprioritized, plus
unknown/missing comparisons, at the granularity native results support. These are counterfactual
observations, not permission to skip work or a causal estimate of saved compute. Do not add an extra
full-suite run, per-test coverage database or learned scheduler solely to collect them.

For future local-model and CI placement experiments, code first filters hard requirements such as
platform, tools, data destination and available machine resources. A model may rank only eligible
choices. Local inference can compete with builds, Metro and simulators for memory and compute;
local is not automatically faster or cheaper. Use existing resource observations where available
and retain unknowns. RC4 adds no local inference server, resource monitor or placement scheduler.

## Exposure and measurement

Before adding calls, close the supported caller's identity and input-capture gaps. Ordinary
check/provider entry should carry already bound task/revision and requirement evidence without
requiring the coding LLM to invent IDs or repeat flags. Where a native host offers no such binding,
retain explicit entry or provider-free fallback and label the caller unsupported. No universal
native-conversation hook is assumed.

Extend the existing episode/receipt/outcome owners for check and provider assignments. Record:

- Requested and resolved mode/effect, caller exposure, no-call reason and captured/omitted evidence.
- Requirement/subject/question/configuration identities and the original required validation plan.
- Fixed baseline, proposed pair, dispatched pair and native reported pair; explicit selection source.
- Classified category, exact operator mapping, and whether the binding was eligible/applied; a
  correct category does not establish that its assigned model was effective or less expensive.
- JEV usage once, all available coding/review model usage, retries, rework, time to useful feedback,
  elapsed completion and independently assessed accepted outcome. Unknown usage stays unknown.
- Whether advice reached a caller and whether a recommendation was actually used; delivery alone
  does not prove avoided LLM work or an improved outcome.
- Delegation route, inherited constraint, override authority and expected feature receipts, including
  missing coverage, rejected bypass attempts and permitted provider-free fallbacks.

Keep operational reservations in the existing SQLite owner and artifacts in existing bounded
file-backed stores. No new database, analytics service, global session manager or per-step ledger.
Provider failure is baseline operation; loss of required admission/identity evidence is a visible
native failure. Unknown telemetry never becomes a zero-cost observation.

Start with a small reviewed set of real episodes, including success, defects, legitimate changes,
partial proof and unsupported inputs. Separate deterministic functional fixtures from independent
quality labels and subsequent real-work evaluation. Sample apparently successful cases as well as
flagged concerns to detect false negatives. JEV must not be the sole judge of its own routing quality.
If no suitable real task exists, mark benefit unmeasured rather than manufacturing repetitive work.

Use matched assignments with the same requirements and acceptance checks. Compare current fixed
model behavior with the routed path, and native/code-only CI advice with that advice plus JEV.
Count evaluation overhead and every retry/repair. Quality evaluation adds monitoring until it
demonstrably replaces review work or prevents rework; it is not automatically a token-saving feature.
Count available cached versus uncached input, cold start, context transfer and local resource
contention alongside model charges. Keep useful native conversation affinity; switching every
message can discard context/cache benefits. Unknown costs stay unknown, not zero. A higher share
of local or smaller-model requests is an exposure statistic, not a savings estimate.

Keep a small question-level quality sample containing near-matches, no suitable category, missing
setup, contradictory evidence and irrelevant text. Compare changed question/model versions on that
same held-out sample; do not silently transfer a threshold between Choice and Noul. Useful labels
come from independent review and native results, not the classifier's own confidence. No continuous
optimizer, question-authoring agent or large benchmark service is required for RC4.

## Boundaries, fallback and later work

All new features inherit existing JEV deadlines, cancellation, redaction, source allowlists, provider
health suppression and the shared task/revision budget. Do not increase the budget merely to make
the new consumers fit. Inspect demand first; off and missing-token operation remain useful.
The decision provider/model is distinct from the coding model chosen for an assignment.

Enforce data-sharing and destination rules in code before the first decision call. Asking hosted
JEV whether an unapproved payload is private already discloses it. Any future semantic privacy
screen can restrict or abstain; it cannot grant permission to share. Every fallback obeys the same
rules: a local-only task with no eligible local provider must stop or use an authorized code-only
operation, never silently use the cloud. Keep credentials out of classifier evidence and telemetry.
The trusted provider caller carries this as `dataDestination: local-only` in its bound request.
All current native generation adapters are hosted, so this value refuses before context preparation,
classification or native launch. `cloud-allowed` or omission retains the existing authorized cloud
submission behavior. This field grants no additional JEV source permissions; its allowlists still apply.
RC4 uses the existing provider-free fallback. Alternate decision backends are outside this work.

Tool-risk and action-intent classification remain research candidates. Known permissions,
destructive commands and scope restrictions stay code-owned. No semantic answer certifies safety
or grants permission. A future intent screen requires evidence of a gap in the existing action
owner before introducing another per-tool decision. The guarded host hook in RC4 is deterministic;
it does not call JEV on each tool invocation.

Device classifications operate on permitted text logs, runner state and available accessibility
evidence. JEV's text interface is not screenshot interpretation. No new vision pipeline or autonomous
UI controller is implied; native target identity, crash detection, recovery grants and cleanup keep
their existing owners. Release-risk/claim triage remains a later use of supplied evidence; tags,
versions, artifact identity and publish authority stay deterministic.

Also deferred: automatic repair/retry cascades, model switches inside a live session, cross-provider
routing, learned model rankings, a new source index, physical-device disruption testing, live
attention suppression, predictive test omission and automatic policy tuning. These remain possible
extensions; none is necessary for RC4's useful opt-in behavior.

The [RC4 proof matrix](../reference/2026-09-21-decision-layer-functional-validation.md#rc4-required-proof)
defines minimum functional acceptance. Publication uses the existing immutable release process;
release completion, adopter exposure and measured benefit remain separate claims.

## Research basis and limits

LangChain's September 17 [harness article](https://www.langchain.com/blog/building-a-harness-with-jev)
demonstrates model routing, tool-risk screening and multiple questions over shared state. Its sample
router uses the latest message to select a model for a run. Our assignment-bound selection also
uses native capability, explicit-choice and evidence constraints. No LangChain dependency is needed.

The September 20 [evaluation article](https://www.langchain.com/blog/jev-agent-evals-langsmith)
compares judges on five fixed weather-agent examples with 100 judgments per example. That supports
testing inexpensive frequent evaluation; it does not establish coding accuracy or development
productivity. Repeatability and correctness require separate measurements. Neither vendor
classification multipliers nor this narrow comparison are performance claims for this project.

A supplied [routing demonstration](https://www.youtube.com/watch?v=ZR7anrL50xs) contributes
destination restrictions and conversation affinity. The [September research reconciliation](../research/2026-09-21-jev-agentic-development.md)
adds primary-source evidence on retrieval, skill selection, evaluation, task routing and CI. It
supports the bounded experiments above, not a claim of measured savings in this harness. The
operator's subsequent direction narrows DL08 to task classification plus preselected model bindings.

The candidate host's official [hook contract](https://code.claude.com/docs/en/hooks) supports
deterministic tool denial. Its [settings precedence](https://code.claude.com/docs/en/settings) and
[sandbox boundary](https://code.claude.com/docs/en/sandboxing) are separate controls that require
host-version qualification. These capabilities motivate a bounded adapter; they do not establish
that the current engine worker or an arbitrary host session is confined.


## Implemented command and host boundary

`provider-doctor --request <assignment.json> --directory <job>` inspects the bound assignment,
existing qualification and legacy policy without submitting a job, invoking JEV or probing native
models. Ordinary `provider-doctor --provider ...` retains its existing meaning. Missing optional
qualification yields baseline-only; invalid required authority fails preflight. Preflight never
creates/migrates the authority database. It cannot certify current authentication or model access.

The trusted host uses `authorizeProviderAssignment` from `host/v1`; workers receive its `admission`
reference. The host owns the core task record, provider configuration and coordination registry
outside every source root. Admission and job directories share one protected parent, bounding the
native history inspected for candidate qualification. Same-pair failures invalidate older success;
proof also expires after 24 hours and after host/settings/tool/root changes. This is an initial
conservative validity window, not a measured model-quality threshold. Incomplete history makes a
candidate unqualified. No second eligibility database is introduced.

If project-owned model-selection prose exists, activating category routing requires the trusted
host to attest its exact digest with `reviewedLegacyPolicyDigest`. No prose is translated or
rewritten. A later edit invalidates the binding. Explicit operator reviewer choices remain fixed.
`authorizeProviderContinuation` binds a follow-up prompt to the same requirement and parent result;
without that attestation the guarded follow-up is refused. Continuations keep the original pair,
context and tool restrictions; a new requirement needs a new assignment.

The initial Claude profile uses restricted/safe mode and only Read, Grep and Glob, plus the native
structured-result tool. It records the executable bytes and local managed policy. Remote managed
policy remains an administrator trust boundary. A script executable digest does not independently
hash all imported dependencies. Native authentication remains provider-owned; the restricted file
tools do not grant the child access to provider credentials. An unexpected tool event is a detected
violation, not proof that an action was prevented; qualification requires native denial evidence.

`check-output --run <id>` returns bounded, source-linked output selection. Native status, required
failures and cleanup remain code-owned. `check-status` returns a compact terminal summary;
`--full` retrieves the original projection. `plan --compare-run <id>` compares recommendations only
with existing same-source native evidence; it launches no additional checks and claims no savings.
Caller episodes record off/fallback/unavailable outcomes as well as successful delivery. Historical
unknown provider-call usage remains unknown rather than zero.

An opted-in workflow may declare `androidEmulator: {serial, adb, lockPath, capacity}`. The capacity
entry names `beforeStage` and `minimumAvailableBytes`; the adapter owns that threshold. The engine
checks exact online identity and bounded `df -Pk /data` evidence immediately before that stage.
Insufficient or unknown capacity prevents installation and preserves declared cleanup. Cleanup
readback requires exact target absence, closed console/ADB/claimed loopback ports and adapter-lock
absence. The same observer serves ordinary completion and declared cleanup continuation. No
automatic erase, uninstall, emulator replacement or physical-device removal test is introduced.


Guarded Claude launches disable automatic session-title generation using the host's documented
`CLAUDE_CODE_DISABLE_TERMINAL_TITLE` setting. This avoids an unnecessary background small-model
request ([host reference](https://code.claude.com/docs/en/env-vars)). The setting is frozen in the
admission alongside tools and permissions. Provider telemetry separately exposes bounded native
per-model usage and model names beyond the requested pair, without summing them again into
aggregate costs. It does not infer that every additional native usage entry is a delegated job.
Native effort readback may be absent: keep requested effort and reported effort separate, and do
not claim an independently observed effort when the host does not report one.


### Adoption details for CI advice and Android observers

The DL07 `/2` questions include adopter-authored pack descriptions. Deliberately include the relevant
`config/validation/packs/**` declarations in `allowed_source_paths`, alongside the source paths being
assessed. Otherwise `source-scope-disabled` is the expected fallback; question opt-in never widens
source permission. Do not add broad source allowances merely to suppress that result.

An Android adapter must name a canonical ADB executable outside its workflow workspace. The parser
and native observations recheck that boundary. Public observers require the workflow workspace
explicitly; the process working directory is never a substitute. Observations inherit tool locations through the
existing command environment allowlist and do not receive ambient provider or publisher credentials.
Policy-denied Claude work remains blocked, but a bound native policy refusal does not invalidate an
otherwise successful model qualification. Unknown or genuine capability failures still do, including
policy refusals whose cleanup remains unknown.
The exemption requires the hash-bound `policyRefusal` marker introduced in RC4. Earlier unmarked
failure receipts remain conservative: run a fresh fixed-model qualification after the last such
failure rather than rewriting old evidence or reusing an earlier qualification.

The trusted host must supply `dataDestination` on every cloud-restricted assignment. RC4 refuses
all explicit local-only submissions; it does not create a durable local-provider authorization.
Adding a local generation adapter later requires persisted destination policy and continuation
binding before relaxing that refusal. A missing property must not silently widen such future policy.

### Local exposure retention and sampling

Entry receipts remain immutable and local, including when inference is off. RC4 does not automatically
delete evidence referenced by outcomes or active work. At an idle measurement boundary, an operator
may archive completed-window episode files outside the live collection after preserving their paths,
hashes and any outcome-manifest references. Do not move active or still-referenced files; do not clean
budget, provider-health, authority or native ownership state as part of exposure archiving.

Exposure reports scan at most 10,000 directory entries and 16 MiB, then select the newest captures
up to the requested report limit, with receipt ID as a stable tie-break. `scanComplete: false`
explicitly limits that ordering to the partial scan; it is not a globally recent sample. `truncated`
also reports a complete scan with more candidates than the requested limit. Reports never imply
representative usage or savings from these samples. The receipt's returned path identifies the live
episode collection; no second retention service or database is introduced.
