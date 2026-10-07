---
id: spec.engine-optional-computer-use-testing
title: Optional Computer Use and Combined Visual Testing
type: spec
status: approved
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Defines optional local Holo grounding, project-owned execution and Decisions checkpoints for realistic synthetic UI tests.
---

# Optional computer use and combined visual testing

## Intended outcome

Use Holo4-27B locally to locate a control in a screenshot. A caller-owned browser runner validates
the proposed point and performs the action. OpenAI Decisions evaluates fresh screenshots at named
checkpoints after the action run through the decision runtime's planned `evaluate_evidence` entry. Native
assertions and independently assigned visual labels establish whether the experiment succeeded.

Start with scripted tasks and single-call grounding. This gives us realistic combined tests while
making failures reproducible.

This is an optional experimental extension. The operator authorized specifications, plans, Opus
5.5 medium review, reconciliation, simplification and a local documentation commit, then included
model-free implementation in 4.2. Model installation and live or paid experiments remain separately
scoped work. The operator has
confirmed permission for experimental use of the 27B weights; the runtime does not acquire or
redistribute them.

## Owners and scope

| Owner | Responsibility |
| --- | --- |
| Governance engine and harness | Existing selection, execution lifecycle, native results, task/evidence retention and required-proof policy |
| Local Holo adapter | Bounded screenshot-to-point request, response validation and observed model/runtime identity |
| Project test runner | Scripted goals, browser session, capture, coordinate mapping, allowed actions, state assertions, cleanup and experiment report |
| Existing decision runtime | Evaluation admission, disclosure, provider selection, accounting, cancellation and validated answers |
| Project/operator | Optional versus required coverage, independent visual labels, quality criteria, experimental permission and local machine bindings |

The [decision-provider specification](engine-decision-providers-and-image-evaluation.md) remains
the only evaluator contract. Its B1–B3 delivery is a prerequisite for combined installed proof;
the evaluation entry is not yet an installed capability. This extension does not turn evaluation
into execution or add Holo to the native coding-agent providers.

The first implementation is a caller-owned experiment command and thin Holo client, invoked through
the existing custom-check seam. It calls the planned `project-governance evaluate --request-file`
command for separate evaluation. No shared engine, harness, package or export changes are planned;
any discovered shared gap needs a named, separately accepted change. Browser dependencies belong
to the caller's test setup, not core installation.

Initial execution targets a disposable local browser app with synthetic data. The runner may be a
small Playwright-based project command, but its capture/action boundary must be qualified first.
No currently qualified general computer-use executor is assumed. Desktop, mobile, authenticated
sites, remote writes, arbitrary code execution and model-directed shell/MCP calls are outside this
first delivery. Keep adopter fixtures, machine configuration, weights and runtime evidence outside
this reusable checkout. Generic contract-test fixtures can live with their owning source tests.

## Optional tools and availability

Apply the [capability-boundary principles](engine-capability-boundaries.md) at the requesting
command. Do not add a global plugin registry, startup scanner or model-service supervisor.

Normal installation, startup, resume and unrelated checks must work with neither model nor API
credentials. Only a selected experiment inspects its explicitly supplied dependencies. Report
configuration, bounded readiness and qualified behavior separately: an endpoint responding or a
model name matching proves neither image support nor correct actions.

| Condition | Selected optional experiment | Selected required proof |
| --- | --- | --- |
| Disabled, unconfigured, stopped or incompatible dependency; missing credentials | Emit warning with an advisory not-run finding and reason; continue independent checks | Emit failed with a blocking missing-proof finding |
| Invalid selected configuration | Emit failed with a blocking configuration finding and zero action/dispatch | Same error; no weakened requirement |

Use the existing checker envelope: optional absence requires both `status: warning` and a finding
with `severity: advisory`, structured coverage/reason and run identity, and exit 0. A bare warning status with
no advisory finding normalizes to passed. Required absence uses `status: failed`, a blocking finding
and nonzero exit. Neither lane reports `not-applicable`; it can count as passing plan proof. No new
checker status is introduced. Required visual adoption remains future work; this delivery tests the
mapping with a synthetic required command whose dependency is missing.

Invalid unused experimental settings must not break core startup. A selected command validates its
complete configuration before inference or action. Availability never grants permission. A required
lane cannot become optional because a dependency is missing; neither an optional skip nor a
successful native assertion establishes combined visual coverage.

Ordinary doctor/startup paths perform no scan, download, service start, fallback or inference.
Expose only configured operations and their current evidence limits to an agent. Disabling an
evaluator restores provider-free operation but cannot satisfy a required visual proof.

`capability-contract.ts` is an engine-major-3 pressure test: reuse its principles, not its descriptor
as a current registry, and do not migrate it just for this pilot.

## Local configuration and qualification

Use one explicit local Holo connection in host-owned ignored configuration. Bind the selected
model revision, quantization, matching image projector, serving runtime/version and endpoint.
Use inline screenshot bytes and a literal loopback IP endpoint, rejecting hostnames, redirects and
remote destinations. The server start command binds to loopback. Local inference remains an
operator-declared binding supported by inspected server configuration/model/projector paths;
a loopback endpoint can be a proxy and does not independently attest to local processing.

The first Apple candidate is Holo4-27B Q4 GGUF plus its matching projector served by llama.cpp.
Document a reproducible install/start command after checking the chosen runtime version; do not
copy Holo3.1 flags or speed claims into Holo4 proof. Other runtimes remain deliberate alternatives,
not automatic fallback. Record configured artifact identities and what was actually verified;
an arbitrary served-model alias does not attest to loaded weights.

Local setup uses three separately invoked checks:

1. Passive inspection reads explicit configuration, executable and model/projector identities only.
2. Explicit readiness makes bounded, non-inference requests to the configured service.
3. Explicit screenshot smoke proof checks image/grounding compatibility, valid response and the
   runner's mapping to the intended control.

Combined scenario qualification separately checks Decisions admission and independent state/visual
truth. Local setup success cannot stand in for that checkpoint.

## One bounded test loop

Each scripted task declares its fixture identity/seed, allowed origin/session, action sequence,
checkpoint criteria and finite step, inference, evaluation and elapsed-time limits. Host code owns
these values. The model receives the target description and current capture, not the hidden state
oracle or reference labels. The initial grounding profile requests no thinking and temperature zero;
valid output is still a proposal, not proof of correctness.

1. Capture the current viewport and retain its bytes, digest, dimensions, device scale and session
   identity. The runner owns a capture token that binds the proposal to this state.
2. Ask Holo to locate the scripted target in those exact bytes. Accept only finite integer `x,y`
   coordinates in its documented 0–1000 space. Reject malformed/extra fields and unsupported output;
   do not convert free text or arbitrary tool calls into actions.
3. Map to the runner's coordinate units using the exact capture geometry. Validate the resulting
   point is inside the permitted viewport and bind the fixed scripted action to that point. Never
   clamp an out-of-bounds result into a valid action. Typed text comes from the script, not the model.
4. Before action, verify the session, viewport and declared fixture generation/change events still
   match the capture token. A known stale proposal is discarded and a new capture consumes the
   declared budget. This check and click are not atomic: a later render race can still cause a wrong
   action, which the hidden event/target oracle must detect. No general browser freshness guarantee.
5. Write action intent and identity to the runner's artifact directory and flush before dispatch;
   failure to retain it prevents action. Execute once through the runner, then collect
   its result, fresh capture and native state evidence. A timeout or lost acknowledgment after
   dispatch is unresolved until readback settles the state; never replay a mutation to discover
   whether it happened. Cancellation cannot establish that an action did not execute.
6. Retain captures at declared checkpoints. After the action run, a separate evaluator command
   submits those frozen captures and written questions to `evaluate_evidence`.
   Reuse its operation identity, dispatch guard, credentials and receipts. Independently interpret
   each answer; preserve refusal, unknown and unavailability. Parse the structured envelope on both
   exit codes, retaining valid answers and failed/unavailable questions. If no valid envelope is
   returned, record requested questions as unavailable. Exit 0 is not a UI pass;
   evaluator failure cannot rewrite an already recorded native task result.

The initial script supports bounded click, typing into a grounded field and scroll within the
fixture. Navigation, reset and cleanup are deterministic runner operations. One local browser
session and one run suffice. Existing workflow/check execution owns the process and cancellation;
the project runner's existing test artifacts retain action evidence. Do not build another task
store, resumable agent service or supervisor. An interrupted run ends unresolved. A new run resets
the disposable fixture and references the earlier run ID; it does not resume or replay the old run.

Use Decisions as advice in the first experiment. It cannot waive a native assertion or automatically
retry/repair a UI action. A later bounded recovery rule can choose among host-supplied actions only
after separate workload qualification; that is not part of the initial driver contract.

### Disclosure and authority

Local Holo use does not approve screenshots for OpenAI. Each evaluation uses the existing explicit
supplied-evidence disclosure grant and approved roots, including questions and any reference images.
Independent truth labels and native oracle state never enter either model's request. Public Choice
options or Score legends are question definitions, distinct from held-back correctness labels.
A local-only run cannot invoke the hosted evaluator. Use synthetic content for initial combined qualification.
Credentials remain caller/host-owned and never enter argv, action text, screenshots or receipts.
Only the separate evaluator command receives its declared OpenAI credential. The driver command,
browser and Holo subprocesses run with an explicit minimal environment that excludes it. The
evaluator plan's B3 credential-forwarding proof remains the shared owner; caller proof checks this
additional driver boundary. Artifact paths must be within that caller's evaluator workspace/approved
roots. Do not assume an external artifact directory is admissible; prove it against the delivered entry.

Page content and model output are untrusted. They cannot broaden the allowed origin, invoke another
tool, update a baseline or change a required check. The runner restricts browser navigation and
network activity to the disposable fixture; requests to OpenAI occur only through the separately
authorized evaluator, outside the browser. Independent checks continue after ordinary model
unavailability. Existing native process-failure, dependency and fail-fast rules remain effective;
this optional caller does not override them.

## Realistic synthetic scenarios

One small local app supplies three tasks. Each has a known-good variant and a few deliberately
defective variants. Freeze fixture version, seed, viewport, script and criteria before comparison.
Keep the hidden state oracle out of both models' input; label visual evidence without seeing model
answers. Previously unseen terminal captures need independent labels before quality scoring.

| Scenario | Combined task and visual checkpoint | Independent truth and seeded defects |
| --- | --- | --- |
| Form validation and submission | Ground a field and Submit; show a validation error, correct synthetic input and submit; evaluate visible error/confirmation | Native record values and exactly-once submission count; missing tiny error text, wrong value and a success toast with no saved record |
| Settings dialog and persistence | Open a menu/dialog, change a setting, save and reload; evaluate the visible selected state and paired before/after appearance | Persisted fixture state plus frozen visual labels; clipped label, overlay intercepting a click and setting that reverts after reload |
| Canvas control without a useful selector | Ground one of two visually similar controls, activate the scripted one and evaluate its visible feedback | Instrumented fixture event/target identity plus independent visual labels; wrong target, delayed render that invalidates the point and missing feedback |

Use targeted failures across the scenarios rather than a full Cartesian matrix. Include loss of
Holo before action, Decisions timeout/refusal, cancellation and exhausted budgets. Add a deliberate
lost action acknowledgment after a real fixture mutation to prove readback prevents duplicate
submission. A visually convincing success with wrong native state must fail the native task even
when Holo picks the apparent success and Decisions approves it.

Each seeded fault declares its expected outcome before a run: malformed/out-of-bounds or known
stale proposals are rejected before dispatch; wrong targets or missing persistence fail native
assertions; clipped/missing visible content with correct state is a visual defect; lost effect
evidence remains unresolved until readback. A render race missed by the precheck must appear as a
native wrong-target failure, not as freshness prevention.

Use one Holo action run per trial with independent assertions and retained checkpoint captures.
Compare its native results without evaluation to Decisions advice on those same frozen captures.
This paired comparison avoids two nondeterministic browser executions masquerading as identical
arms. The paired comparison measures evaluator detection and added evaluation cost, not improved
completion from adaptive decisions. A deterministic fixture test remains the wiring baseline.

Report task completion, wrong-target/duplicate actions, false visual passes, false alarms,
refusal/unknown/not-run coverage, calls/steps and p50/p95 elapsed time with sample counts. Show native
task results and visual evaluation quality separately. Include setup/cold-start cost separately from
steady-state runs. Native success does not certify a visual criterion; model agreement does not
establish truth. Small fixture results qualify this workflow only, not broad desktop/browser safety.

## Image preparation and cost experiment

The caller-owned [image comparison protocol](../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md#live-qualification-and-rollout-boundary)
owns the preparation experiment. Reuse the scenario captures and frozen independent labels. Keep
the original control capture unchanged; evaluation derivatives must not alter Holo's coordinate
geometry. Record original/derived artifacts and transformations. A crop cannot certify an
out-of-crop property; whole-screen criteria retain context.

## Other uses and adoption

Future opportunities include screenshot-assisted failure triage, guided manual testing and document
viewer navigation. Each new driver/target needs scoped qualification; these examples grant no new
execution effects, and mobile/desktop results cannot be inferred from a browser fixture.

Core and installed package tests use fixture providers with no models, network or credentials.
Local Holo proof and combined paid proof are separately opt-in, with their actual evidence outside
this repository. Required visual assertions need accepted workload/model/preparation criteria
before deliberate adoption. This plan does not select a release or change installed adopters.

## Acceptance criteria

| ID | Criterion | Proof owner |
| --- | --- | --- |
| R1 | Core install/startup/resume and independent checks work without experimental dependencies; selected optional/required coverage is honest | Caller command fixtures and an unselected-check core regression |
| R2 | Explicit local configuration, passive/readiness/smoke boundaries and observed identity have no automatic install/start/fallback or remote Holo dispatch | Adapter/configuration fixtures; later local setup evidence |
| R3 | Qualified runner validates capture geometry/freshness, bounded actions and durable intent; ambiguous effects are observed before another mutation | Runner fault fixtures and selected browser smoke proof |
| R4 | Combined checkpoints reuse the evaluator's admission, disclosure, accounting and answer semantics; native/visual truth stays independent | Fixture evaluator integration and later combined evidence |
| R5 | Three realistic scenarios include known defects and a paired native/evaluator comparison on the same frozen captures with honest quality, latency and cost reports | Scenario/oracle fixtures; later independently labeled live results |
| R6 | Image comparisons retain originals/derivatives, protect control geometry and choose only against predeclared quality requirements | Preparation fixtures and later frozen-capture comparison |

## Research basis

Verified 2026-10-06 and refreshed 2026-10-07 UTC. H Company's [local inference guide](https://hub.hcompany.ai/models-api/local-inference)
lists Holo4 GGUF/llama.cpp and vLLM formats; the measured speed material on that page is Holo3.1.
The [27B model](https://huggingface.co/Hcompany/Holo4-27B) and
[GGUF artifacts](https://huggingface.co/Hcompany/Holo4-27B-GGUF/tree/main) identify the candidate.
Its [grounding guide](https://hub.hcompany.ai/models-api/element-localization) defines single-call
localization and image-relative coordinates. These are provider contracts, not measured pilot proof.

OpenAI's [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and its endpoint
OpenAPI schema define typed predicates/choices/scores and supplied images. The request-reference
page was unavailable during verification; the guide and schema own the implemented contract. The
[vision guide](https://developers.openai.com/api/docs/guides/images-vision) explains image preparation
and model-dependent detail. Refresh supported profiles and
[Decisions pricing](https://developers.openai.com/api/docs/pricing) before live comparison; do not
invent a gpt-6-luna image-token formula or turn API charges into a total workflow cost estimate.
