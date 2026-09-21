---
id: spec.harness.development-loop
title: Development Loop and Proof Coordination
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Development loop and proof coordination

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C02/C03/C05/C18](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
shared proof planning, preserved hook boundaries and RN round trips. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Outcome and authority

Reduce repeated coordination, unnecessary invocations, broad reruns and log ingestion. Preserve the
required proof. Governance owns policy and selection; project runners own builds, caches, devices and
assertions. Harness remembers the current candidate, jobs and receipts. Codex reasons and edits.

This contract adopts existing governance policy; it does not invent weaker hooks. The current
public plan/batch adapter is implemented. Automatic integration with hook receipts, complete proof
plans and device workflows described below is planned work, not an existing skip cache.

## One coherent change loop

1. Resume intent, constraints, source identity, open jobs and useful prior evidence.
2. Plan an observable batch, focused checkpoints, expensive build point, required claims and review
   boundary. Reuse project runbooks; do not require a new form for each edit.
3. Edit with Codex. At a checkpoint, governance/project rules select the cheapest sufficient feedback.
   Group related fixes before expensive builds, unless compiler/integration uncertainty needs earlier proof.
4. Dispatch a declared job through the existing owner. Wait on its handle or qualified completion
   delivery; do not run both. Recovery observes the same job, including pending cleanup.
5. Return normalized findings plus bounded excerpts and full-log references. Collect independent
   findings together. Fix related issues, then recheck affected owners. Missing diagnostics stay unknown.
6. Freeze the candidate for integrated proof and applicable independent review. A review consumes
   current evidence; another broad test run needs a changed input, missing claim or concrete risk.
7. Prepare commit and PR narratives. Let the relevant hook perform its gate once. CI establishes its
   own boundary. Reconcile after merge; accept against the actual resulting candidate and required proof.

## Stage responsibilities

| Boundary | Required behavior | Avoidable cost to remove |
| --- | --- | --- |
| Edit loop | Focused owner test at planned checkpoints | Full matrix after each edit; repeated setup/review per helper |
| Device/integration checkpoint | Project-owned build/install/test for a named claim | Rebuild/reinstall without a changed relevant input or fresh-state need |
| Pre-commit | Actual staged snapshot; impacted checks and changed-file secrets | Manual identical gate immediately before `git commit` invokes it |
| Commit message | Cheap narrative preflight before expensive staged gate | Replaying source validation solely to repair message structure |
| Pre-push | One branch-aware impacted local sign-off; full tracked secret scan | Manual sign-off immediately followed by the same hook |
| Pre-PR | Shipped `pr-description` title/body check only | A second full local code sign-off labeled pre-PR |
| CI PR | Provider's candidate/environment and applicable checks | Unrelated jobs selected without project justification; never skip CI just because local passed |
| Release | Explicit required broad gate and destination readback | Reassembling known evidence; never substitute local tests for publication/device proof |

An adopter can declare additional requirements. Record that policy rather than silently rewriting it.
Git retries legitimately invoke gates again; prepare narratives first and distinguish retry cause from
unnecessary manual duplication. Bundling does not give harness permission to bypass hooks.

## Two separate optimizations

**Avoid duplicate requests now.** A known running action is observed rather than resubmitted. Normal
Git actions own their hooks. Deterministic status says which planned step is next. Existing source
identity and job receipts make this practical; cross-session automatic coordination still needs wiring.

**Reuse a finished verdict only when its owner permits it.** There is no new harness verdict cache in
slice 1. Any later reuse must establish the exact claim, check implementation and policy revision,
input/dependency closure, configuration/toolchain/environment, binary identity and expiry. Staged,
working-tree, branch and merged candidates are different subjects. If completeness is unknown, rerun
or explicitly report the proof gap. Source equality alone is insufficient. Mandatory gates still run;
any internal reuse belongs to governance or the project build system.

## Device and local-CI lane

Take one real project's existing canonical runner as the first device adopter. Prefer a project with
high observed build/setup cost; do not generalize across every ecosystem first.

- Name source/dependency/toolchain inputs, resulting binary digest, test scenario, device identity/OS,
  app state/reset requirements, external-service posture and the proof claim.
- Use the existing resource owner to serialize builds with shared outputs, installs and device runs.
  A worktree is not a new device or port. Isolated jobs may run concurrently under that owner's rules.
- Separate build, install and scenario execution receipts. Reuse the build system's artifact only
  where its owner establishes validity. A docs edit need not rebuild an unrelated binary; unknown
  dependency effects require proof, not a semantic-model guess.
- Reuse an installed app only if the runner verifies binary/device/state requirements. Sensor, acoustic,
  timing and attended acceptance claims need their actual environment. Simulator proof is distinct.
- A “local CI” wrapper must declare what it adds beyond focused proof and pre-push. Remove duplicated
  orchestration upstream; retain independent required CI trust/environment checks.
- Count build/install/scenario/queue/cleanup time separately. An empty log or long wait is not failure.

The unified target qualifies one RN iOS simulator round trip, then the same RN iOS flow on real
devices, under the [workflow contract](../../../../docs/specs/engine-workflow-and-device-contract.md).
Native iOS is later, not an intervening prerequisite. Local process proof supports these slices.
Runtime changes cannot make a necessary compiler or device run intrinsically faster. The attainable
win is fewer unnecessary runs and less agent/operator work around necessary ones.

## Proof section of the working packet

Derive the working packet's proof section from existing task/plan/receipt data: candidate identity, required claims,
known receipts with applicability, active jobs and the next declared operation. Refresh at meaningful
boundaries, not after each tool. No duplicate planner or scheduling service. If governance lacks a
needed fact, add it to its public contract rather than reimplement its policy in harness.

## Source of policy

Read-only governance references inspected 2026-09-19:
`docs/governance/hook-and-check-taxonomy.md` and `docs/governance/validation-strategy.md` in
`/Users/stacy/ORGANTA/project-governance`. Hook taxonomy already limits shipped pre-PR to narrative
checks. Validation strategy already forbids immediate manual/hook duplication and defines focused
proof, valid evidence reuse, device serialization and independent CI. The gap to test is adoption
and durable coordination, not whether those policies exist.

## Compact working packet — accepted design, not implemented

At an explicit task boundary, prepare one packet for implementation, investigation, review or resume.
Restore the bound task/revision, mandatory instructions, workspace/source identity, open jobs and
required proof. Ask governance for routing and use targeted discovery for optional source/history.
The [discovery contract](repository-discovery.md) owns candidates; the
[decision interface](decision-interface.md) may rank optional candidates. Build a deterministic
packet first so optional advice can fall back without another discovery pass.

Materialize selected exact bytes through existing artifact/budget rules. Required context cannot be
filtered out; unavailable or oversized required material blocks delivery. Keep candidate excerpts
and delivered files bound to the same content. Changed inputs invalidate the ranking. Show omissions,
coverage limits, provenance and a bounded expansion path; never claim the discovery list is complete.
Conflicting evidence remains visible. The host can expand context and use native tools.

Include the next operation only when the current plan/owner establishes it; otherwise expose the
open question. Record packet identity and cost at meaningful boundaries, not after each tool call.
Do not insert retrieved material as authority or add an autonomous agent loop.

## Simulator and connected-device workflows — accepted design

Validation is part of task completion. Use existing governed batches and project runners for the
applicable sequence: focused tests, build, acquire target, install, launch, automated scenario,
assertions/artifacts, cleanup and review. Preserve canonical runners that already combine stages.
The harness records stage dependencies and progress; existing executors supervise execution.

A target is explicitly a simulator/emulator or a physical device. Physical devices may be attached
by cable or connected through a supported wireless transport. Ask the project's device owner for
stable identity, platform/OS, availability, connection and readiness. Never select an arbitrary device
when several match. Never silently substitute simulator proof for a physical-device requirement.
Use an explicitly allowed equivalent target only with a new recorded binding and its own receipts.

Simulator boot/reset state, and physical-device pairing/trust, unlock, signing/provisioning and
connection requirements, belong to the runner. Missing prerequisites block the affected stage with
an actionable reason. Do not bypass host prompts. On disconnect or runner interruption, retain the
job identity and reconcile execution/cleanup before retry; lack of connectivity is not confirmed exit.

Bind source/toolchain/inputs, binary digest, target kind/identity/OS, scenario and initial app state
through build/install/launch/scenario receipts. Launch success is not a passing scenario. Native
assertions establish results; visual or semantic observations retain their separate review contract.
JEV can advise on diagnostic excerpts, never manufacture a pass or establish cache validity.

Keep the same resource owner for ports, devices, simulators and shared build outputs across worktrees.
Reuse build/install state only where that owner proves applicability. After a repair, the owner
identifies invalidated stages and required rechecks. Required gates still run. Preserve original
attempts and full-log references; terminal completion includes confirmed cleanup.

Qualify simulator/emulator and physical-device paths separately, including contention, unavailable
or ambiguous targets, disconnect/interruption and resume. Report coverage by target kind and transport;
a wired physical test does not automatically qualify wireless recovery. RN physical qualification
follows RN simulator qualification before broader native/framework lanes. An unavailable physical target
leaves that claim pending, not the whole provider-free development loop blocked.

## Public preparation surface and owner prerequisites

E1a defines and E2 implements `harness prepare --task <id> --purpose <implement|investigate|review|resume>` as the normal
working-packet entry. It composes existing resume/retrieval and governance public APIs; `resume`
remains the inexpensive compatibility/diagnostic operation and does not implicitly call a provider.
The next-proof view is a section of prepare output, not a second packet command. Existing governance
change packets remain internal validation subjects, not substitutes for host context. Native hook
integration selects one entry per boundary to avoid duplicate preparation.

E2/E4 must verify resource acquisition/release in the named project runner. Governance's existing
path/root claims do not prove device, simulator or port locking. Missing ownership blocks that lane
until an explicitly authorized owner solution exists under the target
[host resource contract](../../../../docs/specs/engine-workflow-and-device-contract.md#host-resource-authority).
E1a defines public executor/adapter requirements, E1b assesses the runner, and E2 qualifies necessary
extensions; prefer existing referenced runner artifacts when sufficient.

## Runner reliability before integration

An existing dev loop is a candidate implementation, not an ideal design. E1b first reproduces and
classifies its recurrent failures, then chooses bounded reuse, repair or replacement in the owning
project. Single ownership prevents competing controllers; it does not freeze defective code or
require preservation of every legacy mechanism. A replacement must have explicit ownership/cutover,
not run as a second supervisor beside the old one.

For service-backed apps, qualify service/process identity, workspace and port binding, bundle/input
identity, warm/cold startup, stale state, interrupted cleanup and recovery recurrence. In React Native
lanes this includes Metro and its delivery path; a listening port alone is not proof of the right
bundle or a healthy running app. Separate native rebuild/reinstall from JavaScript delivery/refresh.
These are acceptance cases to test, not claims that any particular runner currently fails them.

Offer one convenient runner entry point while preserving inspectable stage identity, dependencies,
progress, input bindings and results. Expose cancel and stage retry/recovery controls where the owner
supports them and they serve proof or diagnosis. Advertise supported controls explicitly; unsupported
controls return that fact and the owner-supported next action. Do not invent pause/resume or replay a
stage that the owner cannot safely isolate. Coarse invocation must not hide required stage evidence;
inspectable stages do not require a second harness state machine mirroring every internal transition.

Offer a bounded runner operation with durable identity, explicit progress, actionable blocked state,
terminal assertions and full artifact references. Known lifecycle transitions and approved recovery
run in code. The host receives a meaningful change, completed outcome or requested intervention;
it should not repeatedly inspect unchanged logs or decide routine service restarts. Native completion
support must be qualified; an explicit owner wait remains valid where host push delivery is absent.
JEV may advise on unresolved diagnostics but cannot repair process ownership or validate service state.

## Cross-platform expansion

Keep framework/runtime, OS, target kind, transport and scenario as separate qualification dimensions.
An iOS result is not an umbrella proof for every framework running on iOS. Start with the operator's
selected app surfaces, qualifying their concrete runners separately; then expand across the adopter's
supported native, React Native, Flutter or other surfaces. Do not presume a registry's planned entry
has an executable runner. Share only the governed request/result boundary and proven common behavior;
platform/framework launch and test semantics remain project-owned. The pilot mapping belongs outside
this generic checkout and must be carried into the authorized adopter assignment.
