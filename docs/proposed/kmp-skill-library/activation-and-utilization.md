---
id: proposed.kmp-skill-library.activation-utilization
title: KMP Skill Activation and Utilization Contract
type: specification
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Deterministic routing, composition, materialization, and outcome evidence that make KMP skills usable without explicit user invocation.
---

# KMP Skill Activation and Utilization Contract

The library succeeds only if relevant skills reliably influence work. Native model discovery is a
useful convenience, but it is not a sufficient governance mechanism: users should not need to know
the catalog or explicitly name a skill for routine governed work.

This packet defines the proposed activation and utilization contract. It documents the current
boundary honestly; it does not implement a new resolver, schema, receipt, or telemetry path.

## Current behavior

Project Governance is already more proactive than an ordinary folder of skills:

1. Bootstrap materializes the wheel's canonical skill catalog into ignored repository-local state.
2. A target-owned context route can match changed paths plus prompt, product, workflow, and task
   terms deterministically.
3. The selected route can declare top-level skills, and context resolution reports their paths and
   content digests.
4. The KMP router instructs the agent to inspect the stack-pack manifest and choose a more focused
   leaf.

That is useful discovery, but not yet reliable end-to-end activation.

### Current gaps

- Context routing is proactive only when the adopting repository configures a matching route and
  the coordinator invokes it.
- Installed stack-pack leaves live below nested pack paths, while current deterministic discovery
  resolves top-level skill IDs only.
- The KMP router's leaf choice is made by model interpretation of prose rather than a governed
  applicability record.
- A route can name several skills, but there is no general capability composer for generic owner,
  KMP core, target overlays, and host extensions.
- A resolution proves that a skill was available, not that its complete instructions were read,
  applied, or deliberately declined.
- There is no outcome receipt connecting selection reasons and skill digests to changed decisions,
  validation, or review findings.

The practical consequence is exactly the user's concern: a strong skill may exist in the wheel and
still have no effect on a task.

## Required activation model

For substantial governed work, skill resolution should be an automatic intake step. Explicit user
invocation remains an override or debugging aid, not the normal activation mechanism.

```text
task + changed paths + target facts
  -> generic workflow owner
  -> stack/project-shape router
  -> shared-core capability composition
  -> affected target/device overlays
  -> enabled host/integration extensions
  -> exact selected-skill packet
  -> work and validation
  -> explicit handoff of skill-influenced decisions
```

The adopting repository remains the activation authority. A `matched` route must name the stable
`kmp-implementation` router in that route's own `skills` list. Once selected, the packaged KMP
manifest may compose narrower leaves from the repository's declared skill-context facts.
Router-level `default_skills`, fallback results, and ambiguous results do not trigger leaf
composition, so the runtime cannot attach the KMP pack to a route that did not enable it.

Existing adopters without the optional skill-context fact block retain current router-only
behavior. Proactive leaf composition begins only after a separately authorized adopter records the
KMP target facts and keeps the router on the applicable route.

### Selection inputs

Use deterministic facts before semantic inference:

- changed paths, source sets, Gradle targets, module and artifact declarations;
- target-owned platform profiles, support tiers, consumer surfaces, and UI posture;
- dependencies and exported bindings;
- task intent such as design, implementation, migration, diagnosis, test, or review;
- boundary-pressure, lifecycle, security, publication, and wearable-topology facts; and
- explicit user inclusions or exclusions.

Prompt terms may supplement these facts. They should not override contradictory repository truth.

### Capability composition

Selection is not one winner. A task may compose:

- one generic task owner, such as implementation or architecture review;
- the KMP project-shape router;
- the smallest relevant shared-core leaves;
- zero or more target/device overlays; and
- zero or more explicitly applicable host extensions.

The composer resolves capability ownership and conflicts before loading content. It must not load
the entire KMP library as a substitute for routing.

## Activation levels

| Level | Meaning | Required behavior |
| --- | --- | --- |
| `required` | Deterministic target facts and risk make the capability necessary. | Include exact content; block or report an explicit unresolved capability if unavailable. |
| `recommended` | Strong route evidence suggests material value, but the task may prove it unnecessary. | Include it; the final handoff names whether it affected the result. |
| `available` | Relevant to the broader stack but not selected for this task. | Keep discoverable; do not load into the task packet. |
| `excluded` | Target facts, conflict rules, or explicit scope rule it out. | Do not activate; preserve the exclusion reason. |

Manifest entries also carry one bounded implementation mode: `evaluation-only` or `governed`.
Ordinary routing ignores evaluation-only entries; only the explicit evaluation harness may select
them before a cutover. A route that names an evaluation-only nested ID directly blocks rather than
bypassing promotion, and a releasable manifest contains no evaluation-only entry.

User invocation may promote an available skill for the task, but cannot silently override target
authority, a safety exclusion, or an incompatible capability owner.

## Selected-skill packet

The runtime or coordinator should produce one digest-bound packet containing:

- target-fact digest;
- route and capability-owner IDs;
- selected skill IDs, canonical paths, versions, and content digests;
- activation level and concrete selection reasons for each skill;
- conflicts, exclusions, omissions, and unresolved facts;
- required references and selection-scenario/evidence expectations.

Selected skill content must be loaded through the coordinator path, not left as a catalog hint that
the model may or may not notice. Provider-native auto-discovery is supplemental and outside the V0
enforcement boundary.

## Utilization closeout boundary

V0 requires the task handoff to name the selected skills that materially influenced a decision,
validation, or restraint outcome and any selection that proved inapplicable. It does not add a new
CLI, persistent receipt store, or telemetry path merely to restate that handoff.

A future generic coordinator may emit a local utilization receipt with these statuses:

- `applied`: one or more named decisions, edits, validations, or restraint outcomes were influenced;
- `consulted-no-change`: read and relevant, but current repository evidence already satisfied it;
- `declined`: not applied for a recorded conflict, false-positive route, or target-specific reason;
- `unavailable`: selected content could not be resolved or verified; or
- `not-read`: selected content was never consumed.

That receipt is post-V0 work. It must be designed as a generic coordinator contract rather than a
KMP-specific command and is not a V0 promotion gate.

## Measuring whether the library is used

Do not optimize for catalog size, skill mentions, or token consumption. Useful measures are:

- applicable-task coverage: how often deterministic routes identify an owner;
- false-negative discoveries from review or capture;
- false-positive and restraint failures;
- unavailable, ambiguous, and conflict rates;
- evaluation uplift over the no-skill baseline;
- escaped defects or missing evidence tied to a capability that should have activated; and
- freshness failures discovered during execution.

V0 retains these measures only in reviewed evaluation summaries. Remote or scheduled utilization
telemetry requires a later decision and must never contain user prompts, source code, skill bodies,
or private reasoning.

## V0 proactive KMP routing examples

| Task evidence | Automatic composition |
| --- | --- |
| `commonMain` model plus Swift-facing framework change | Generic implementation + KMP router + API/artifact + source-set boundary + evidence leaf |
| Dense native event stream entering a cross-language host | Generic implementation + KMP router + sharing/architecture + concurrency + API boundary + evidence leaf; bridge pressure is applied through those core owners |
| Wear OS and watchOS progression contract before the wearable overlay ships | Generic architecture owner + KMP router + sharing/architecture + concurrency + API boundary + evidence leaf; topology facts shape the core advice without implying detailed platform mechanics |
| Android-only App Links change in a KMP repository | Generic implementation + KMP router reports the deferred target-overlay gap; V0 does not invent an Android route-intake owner |
| Pure Kotlin collection refactor in `commonMain` | Generic refactor + smallest relevant KMP source/API core leaf; no UI, host, or publication leaves |

After the separately approved wearable slice, the wearable case also composes
`kmp-wearable-architecture`. Other target and host overlays require their own admitted capability;
these V0 examples do not promise them.

## Evaluation contract

Activation itself needs tests:

1. positive routing: matching path/fact/task combinations select the expected composition;
2. negative routing: adjacent Android, Kotlin, UI, and host tasks do not overactivate KMP leaves;
3. conflict: repository authority and more specific overlays win deterministically;
4. missing fact: the router requests or reports the material fact instead of guessing;
5. coordinator conformance: Codex and Claude receive identical selected bytes and reasons through
   the governed packet path;
6. portable discovery: canonical frontmatter contains no provider syntax or user-home paths; and
7. outcome value: the selected composition improves a decision or evidence result over baseline.

## Implementation slices

1. Extend catalog and manifest records with capability ownership, applicability, activation level,
   conflicts, evidence classes, and nested canonical paths.
2. Add deterministic resolution for stack-pack leaves instead of limiting discovery to top-level
   skill directories.
3. Compose multiple capability layers from repository facts and task signals.
4. Materialize the exact selected skill packet and return stable reasons and exclusions.
5. Add activation, restraint, conflict, coordinator-conformance, and outcome-uplift scenarios.
6. Consider a generic coordinator closeout receipt only after V0 usage shows that the handoff is
   insufficient.

The first implementation target should be the small V0 KMP catalog. It is easier to prove proactive
selection with one router and six leaves than with the current 24-leaf surface.
