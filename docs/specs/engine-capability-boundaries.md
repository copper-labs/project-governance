---
id: spec.engine-capability-boundaries
title: Engine Capability Boundaries and Release Pressure Test
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Defines the small extension boundary needed now while deferring full release orchestration and host-specific implementations.
---

# Capability boundaries

Different adopting projects pressure-test the core design; they do not expand the first iteration
to solve every build, deployment or release process. The initial complete workflow remains RN iOS
on a simulator, followed by physical-device qualification. Traditional remote CI and authorized local
CI are both supported directions, independent of whether a project uses release management.

The proposed extension boundary below supports later release work. It does not implement a release
controller, select shared storage, require a cloud service, or change any adopter's release authority.

## Three levels of responsibility

| Level | Owns | Initial scope |
| --- | --- | --- |
| Shared engine | Task/action/source identity, policy checks, durable workflow transitions, operation observation, resource ownership, evidence and telemetry | Existing core direction; make capability availability and external-operation limits explicit |
| Optional capability | A coherent workflow family, such as release planning, promotion, approval binding and recovery | Define a narrow versioned boundary now; implement release semantics only when an adopter slice is selected |
| Project adapter and policy | Actual commands, component inventory, targets, branch/version rules, credentials, migration ordering, smoke assertions and provider recovery | Retain with the adopting project; reuse its existing owners and command catalogs |

A release capability is a product/runtime extension, not a model-specific skill or a requirement
to build an app-store-style plugin system. A skill can explain its use; deterministic code owns its
execution. JEV may assist with summaries or unfamiliar diagnostics, never grant deployment authority,
decide migration safety, waive a failed smoke or declare rollback complete.

## Minimal extension contract to establish early

- **Identity and compatibility:** explicit capability ID, contract version, compatible engine version,
  trusted implementation identity and configuration reference. Reject an incompatible enabled capability.
- **Discovery and absence:** expose supported operations and prerequisites through the same core API.
  Disabled or missing release support does not affect ordinary development. A requested release operation
  with no qualified implementation reports unsupported or blocked; it never silently skips the gate.
- **Typed operations:** validated input/output schemas, effect classification, resource/authority needs,
  deadlines, operation identity and supported observe/cancel/reconcile behavior. The exact API names
  are E1 engineering choices, not newly promised commands.
- **One owner:** the capability uses the engine lifecycle/evidence contract and delegates to qualified
  project owners. It cannot independently launch a second supervisor for the same deployment or job.
- **Explicit authority:** installing/enabling a capability is not permission to invoke its mutations.
  Existing action authority binds the operation, target and inputs; changed scope is not automatically
  approved. Read-only preparation and deployment are separate operations.
- **One installation story:** resolve enabled capability versions/integrity under the product's one
  release/lock authority. Initially use explicit registered modules/adapters, not dynamic discovery,
  a marketplace, another updater or a new plugin package registry. Cloud SDKs and credentials remain
  optional. Pin an independently distributed adapter only if that later packaging need is established.

Reviewed code may call existing project CLIs through structured arguments; a TS engine does not
require every project script to be rewritten in TS. Model-generated commands and untrusted release
records cannot select arbitrary executables. A declared capability is not a security sandbox; execution
must still use its required isolation and credentials. Do not load candidate-controlled code into a
privileged controller merely because it conforms to a TypeScript interface.

## Core assumptions exposed by release work

| Pressure test | Early design consequence | Deferred implementation |
| --- | --- | --- |
| A provider accepts a deployment, then the caller times out | Operation identity and `unknown` outcome survive runner exit; observe/reconcile before replay | Provider-specific lookup, idempotency and recovery |
| A local runner and a remote job target the same environment | Resource scope can name a remote environment; local process locks cannot claim cross-machine exclusivity | Shared admission backend and enforcement across all mutating entrypoints |
| A laptop dies after starting an external mutation | Describe required durability independently of execution location; local-only evidence cannot claim remote recovery guarantees | Shared durable intent/evidence custody selected with the release adopter |
| Approval, source or target state changes before the next step | Recheck the existing authority binding and required input facts at the side-effect boundary | Release approval representation, expiry/revocation policy and target-specific comparisons |
| Code, database and worker versions move independently | Evidence can reference several component/artifact identities; one Git SHA is not the entire deployed state | Release manifest/component registry and compatibility rules |
| Only one business journey needs activation or proof | Recipes select declared project steps; no globally hard-coded feature or smoke suite | Domain adapters and scenario-specific authority |
| Remote CI or local CI succeeds | Validation evidence can feed a later authorized action; CI success is not deployment permission | Hosting-specific approval and credential integration |

These are capabilities of the core contract, not a demand to build a distributed workflow platform
in E1. Use the existing Action/Artifact/Evidence concepts. Add only fields or interfaces needed to
express ownership, external observations and required durability without claiming unsupported behavior.

## External-operation lifetime and custody

Keep local task/continuity state in SQLite as planned. A future shared-environment capability must
identify the authoritative admission and mutation journal outside a disposable runner, with durable
intent acknowledged before an external mutation. The core may retain references and local views; it
must not become a competing writer of the same admission record. This is separate from optional
analytics and Mnemos memory, neither of which provides execution authority.

Do not claim exactly-once external execution from a local idempotency key. Unknown create/cancel
outcomes require provider readback or explicit reconciliation. Cancellation may stop new steps while
an earlier operation remains active. A process exit or expired lease alone cannot release the affected
environment or justify retry. The later adapter must either enforce fencing/expected-state checks,
or use a single protected mutation gateway; unsupported exclusion remains a named limit.

These requirements already matter to durable device/jobs work, but shared release environments need
stronger persistence and coordination than a single developer machine. Qualify that stronger mode
when implementing the release capability; do not impose its service dependencies on every project.

## Future release capability: enough shape to preserve the option

The proposed flow is prepare a candidate manifest → collect applicable local/remote CI proof → bind
existing release authority → refresh target facts → execute declared ordered operations → verify actual
components and selected journeys → close out or reconcile/recover. A release may collect evidence from
several tasks. It is not necessarily the final stage of every bug fix or merge.

A manifest would bind candidate, target, selected component changes, operation order, required evidence
and compatibility/recovery plan. Human release notes are a view, not another mutable authority. Version
or source changes occur before freeze, or produce a new candidate and invalidate affected proof.

Artifact promotion policy remains project-owned: some artifacts can move unchanged by digest; others
must be rebuilt for target configuration and requalified. Application rollback does not undo database,
data, provider or external business effects. Recovery may require roll-forward or an attended operation.
Staging qualification alone cannot establish production safety or imply production authorization.

Do not turn a site's branch topology, cloud vendors, version scheme, business features or approval
ceremony into the default for all projects. Existing release owners remain effective until deliberate
adopter reconciliation and cutover. A second project is evidence for the extension boundary, not proof
that all its implementation should move upstream.

## First-iteration acceptance and later work

E1 pressure-tests this boundary using a small fake external adapter: successful read-only observation,
unsupported capability, incompatible version, rejected authority, an accepted operation with lost
response, cancellation with an outstanding effect, and recovery from another observer. These are
protocol/failure fixtures, not real cloud or release qualification. Keep actual implementation proportional
to the first supported workflow; record unsupported stronger durability modes explicitly.

E2 still proves the RN simulator workflow. E4 still takes RN to physical devices. E5 qualifies the
declared core and optional capabilities actually included in its scope; full release management is
not a first-core-release gate. A later authorized release assignment selects shared custody, target
adapters and a read-only preparation pilot before any staged deployment or production cutover.

Before dependent release implementation, decide custody/admission, approval representation, artifact
promotion and recovery semantics with the owning project. Those are deferred implementation decisions,
not requests to solve every host's release system during this design pass.

## First-slice contract proof

`components/engine/src/capability-contract.ts` defines explicit versioned registration and
identity-bound external observations. Admission rejects unavailable or unsupported operations and
checks a separately supplied policy grant against the implementation digest. A fresh-process test
reconstructs unresolved observations from retained JSON without the original provider instance.
Its fake-provider test covers acceptance followed by a lost
reply, observation of the original operation, and cancellation with effects still outstanding.
Cancellation acknowledgment cannot produce a terminal result while those effects remain.
This is an interface pressure test, not an external execution provider: workflow recipes continue
to reject external effects until a separately qualified capability supplies authority, durable
custody, transport deadlines and recovery. No plugin loader or deployment supervisor is added.
