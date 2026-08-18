---
id: spec.governance-kernel
title: Governance Runtime Specification
type: spec
status: current
owner: project-governance
created: 2026-03-02
updated: 2026-08-18
summary: Contract for the package runtime, its configuration boundary, and its focused execution model.
---

# Governance Runtime Specification

## Purpose

`project-governance-runtime` is a Python package exposing the `project-governance` CLI. It runs
generic repository checks without absorbing product policy or duplicating build systems.

## Commands

```text
project-governance check --stage <stage> --mode impacted
project-governance check --pack <pack-id>
project-governance check --stage pre-pr --mode all
project-governance plan --stage <stage> --mode impacted --json
project-governance context --task <description> --json
project-governance agent-route --task <envelope> --session <identity> --catalog <catalog> --json
project-governance agent-dispatch start --request <route-request> --json
project-governance agent-dispatch finish --authorization <digest> --results <result-bundle> --json
project-governance doctor
project-governance telemetry status
project-governance init
project-governance update --to <version> --dry-run|--apply
```

`check` emits normalized findings and a stable exit code. `plan` explains selected and omitted
packs without running them. `doctor` reports a missing or invalid integration plainly. `init`
creates only missing integration files. `update` advances the runtime lock only after required
target-owned configuration migrations validate; it stops before a repository-owned decision. Its
dry run reports exact legacy registry migrations and a bounded predecessor-artifact cleanup
inventory. Apply may remove only a prior runtime-owned regular file whose bytes still match its
accepted hash.

`agent-route` is read-only and never launches a model. The two `agent-dispatch` actions are the only
orchestration control-state write boundaries; they emit native launch instructions or close one
previously authorized wave. Missing identity, catalog, readiness, or safe control state returns to
the existing solo workflow.

Stages remain command boundaries, not selectable profiles:

| Stage | Subject |
| --- | --- |
| `commit-msg` | Commit-message policy only |
| `pre-commit` | Staged index subject, including staged-only secret bytes |
| `pre-push` | Branch-aware impacted subject; live publishable worktree-and-index secret scan |
| `pre-pr`, `ci-pr` | Branch-aware impacted subject; live publishable worktree-and-index secret scan |
| `release` | Explicit all-mode checkout-wide subject |

`--mode all` is the explicit exception to packet-only file reads: it authorizes a pack to inspect
the current checkout across its declared full scope. It is not a lifecycle profile or a repair
shortcut.

The later-stage built-in secret scan is also a deliberate live exhaustive surface. Its pack result
has no `subject_digest`; it is never attributed to the branch-aware changed digest shared by the
other selected packs.

## V1.1 Evidence-Integrity Contract

The [completed V1.1 plan](../exec-plans/completed/2026-08-15-governance-v1.1-evidence-integrity.md)
records the implementation and clean-wheel release proof for this source contract.

- Changed and staged execution consumes only the immutable packet's materialized bytes. A
  deterministic `subject_digest` hashes sorted logical records containing path status,
  normalized and previous paths, before/after identities, and exact ranges without depending on
  temporary paths. All mode is explicitly checkout-wide and has no content-bound
  digest.
- Findings use `blocking`, `advisory`, `accepted`, `waived`, or `suppressed`. A result may pass
  with nonempty accepted, waived, or suppressed findings; those findings remain visible. Nonzero
  exit, timeout, interruption, malformed output, missing required evidence, or an unknown state
  remain blocking regardless of a child's finding labels or the pack's enforcement posture.
- Detector IDs are stable contract identifiers. Secret waivers match one detector ID,
  normalized path, exact after-image SHA256, owner, rationale, and expiry. A
  wildcard, expired, unknown-detector, moved, or byte-mismatched waiver will not authorize a pass.
- Deterministic lexical test-quality findings are advisory. Detector/configuration/process
  failures are blocking infrastructure findings. Semantic review remains an ordinary target-owned
  pack; the core never invokes a model or encodes product risk.
- A pack may optionally emit one bounded, versioned evidence manifest beneath its isolated
  per-run/per-pack evidence root. The manifest is `subject_digest`-bound and contains bounded claim
  IDs, outcomes, and inert artifact-digest strings. The runtime will not resolve artifact paths,
  read artifact contents, compose evidence across packs, checkpoint work, resume results, or infer
  proof relationships.

## Built-In Packs

The runtime provides formatting, naming, maintainability, comments, documentation, secrets,
dependencies, test quality, context routing, commit-message, prose, and Apple-dependency packs. A
repository may add target-owned packs and commands. One active target pack may explicitly declare
repository-wide ownership of a non-supplemental built-in through `replaces_builtin_packs` and
`change_packet_contract: 1`. The planner then selects only the target owner in impacted and all
modes, reports uncovered impacted paths once per replacement pair, and retains direct named
built-in execution for diagnosis. Silent, partial, duplicate, or supplemental replacement remains
invalid.

Replacement is the only built-in ownership override. V1.1 adds no profile layer: target packs keep
their existing per-command `stages`, path selection, dependencies, and optional
`replaces_builtin_packs` declarations.

## Selection And Execution

The planner accepts changed paths, an explicit pack, or an explicit all-files boundary. It resolves
dependencies, rejects cycles, and emits one selector finding for an unmapped path. Normal work is
changed-path based. A named pack uses the relevant changed scope so repair remains focused.

The runner owns process groups, timeout, interruption, child cleanup, finding normalization, and
JSON output. It does not maintain a second cache around a repository's build, test, device, or
language tool. It resolves one immutable change packet before execution and supplies one run ID and
one isolated evidence root per selected pack.

Every pack command emits exactly one JSON object with a string `status` and a `findings` array.
Malformed or missing envelopes block; a target wraps an ordinary tool command in its own adapter.

The universal maintainability limit is an architectural-review trigger above 500 lines for a new
or directly changed source unit. Maintained language tools identify classes, types, and other
declarations; the checker measures the changed declaration without aggregating narrow siblings or
nested types. Physical file size is the fallback for parser-free code and changed file-level code.
Crossing the threshold requires a recorded judgment about responsibility, readability, and
testability. It does not require extraction when the source unit remains cohesive.

A durable `cohesion-accepted` decision is keyed by finding, normalized repository path, and
qualified symbol, so comments, formatting, and modest cohesive growth do not reopen it. A temporary
waiver remains bound to exact bytes, current metric, expiry, and remediation plan. A version-1
decision never authorizes a pass and produces one grouped migration obligation.

Comment checks are a changed-code ratchet. New files are fully governed. In an existing file, only
a new declaration or a declaration whose header or public signature intersects the packet's exact
changed range receives blocking declaration enforcement; old overview debt remains advisory.
Parser-backed waivers use normalized path, rule, and qualified declaration name, with `<file>` for
overview rules. Kotlin declarations are externally public only when the declaration and every
enclosing named class, interface, or object are public; a public-by-default member inside an
`internal`, `private`, or `protected` container is not part of the public documentation surface.

Dependency freshness compares normalized `(ecosystem, name, version, artifact_type)` tuples from
the packet's exact before- and after-images. Only introduced or updated after-image tuples require
coordinate-keyed evidence or an operator override. Removed and unchanged tuples require nothing.
Changed and staged execution also ratchets npm entry defects: an unchanged manifest defect is
identified by its group, package name, and exact offending literal; an unchanged lock defect is
identified without its entry path by package identity and its exact offending version, source, or
integrity literal. Removed defects are repairs, while new or content-changed defects block. Invalid
JSON, document shapes, and structural errors always block, and all mode stays strict because it has
no before-image authority. A non-`node_modules` lock package with no resolved tarball is a local
workspace member, not a registry coordinate; linked `node_modules` entries are also skipped.

## Configuration And Distribution

An adopting repository tracks:

- `config/governance/runtime.lock.yaml`
- `config/governance/profile.yaml`
- `config/governance/facts.lock.yaml`
- target-owned extension and pack definitions

The lock names one wheel and SHA256. Bootstrap verifies that hash, installs the wheel in ignored
repository-local state, and materializes generic skills there for discovery. Hooks never install or
upgrade software.

The wheel contains generic runtime code, default packs, schemas, generic skills, and references.
It contains no product identities, paths, target evidence, copied adopter code, or inactive
implementation.

## Maintenance Boundary

The installed system works without a Project Governance source checkout. Routine checks, planning,
context selection, local maintenance, and telemetry do not search for or mutate one. Target-owned
mechanical governance defects may be repaired under the active task's write authority. Policy
weakening, ownership changes, and ambiguous repairs are proposed before application. Runtime-owned
defects are reported without vendoring or patching package code into the target.

Upstream feedback is optional and operator-triggered. No report is created by default. An agent may
prepare a concise redacted Markdown report under `.governance/runtime/feedback/` only after an
explicit request. Direct source-repository work requires an explicit source-work request and then
follows that repository's instructions. Accepted generic changes return to adopters through the
normal pinned-wheel update path.

## Telemetry

Telemetry is a bounded, ignored JSONL file retaining at most 1,000 start and terminal events. It
records runtime/run identity, stage and mode, a non-reversible scope fingerprint, changed-path and
selected-pack counts, execution duration, status and termination, plus per-pack command, finding,
status, and duration aggregates. It never retains paths, commands, process output, prompts, or
source content. Writes are concurrency-safe and fail open; telemetry is advisory only and cannot
weaken, approve, or delete a governance check. End-to-end shadow timing, including planning, is an
adopter measurement rather than a runtime execution-duration claim.

An accepted `agent-dispatch finish` may add one `orchestration-terminal` record. Its allowlist holds
only role, native model/profile, terminal outcome, duration, optional provider-reported token
totals, proof result, and fallback/repair booleans. Status reports retained entry counts, outcomes,
and per-model percentages, explicitly excluding evicted receipts and control-state-only timeouts.
It calculates no prices, spend, savings, or project-wide usage.

V1.1 records only bounded per-pack integer counters:
`blocking_finding_count`, `advisory_finding_count`, `accepted_finding_count`,
`waived_finding_count`, `suppressed_finding_count`, `process_failure_count`,
`integrity_failure_count`, `evidence_manifest_count`, `valid_evidence_manifest_count`,
`invalid_evidence_manifest_count`, `evidence_claim_count`, and
`evidence_artifact_digest_count`. `process_failure_count` counts a child command with nonzero exit
or a termination reason other than `completed`; `integrity_failure_count` counts malformed
envelopes, unknown lifecycle state, or packet/materialization mismatch. Either category fails the
run independently of pack enforcement. Evidence counters describe only the bounded optional
manifest. Paths, detector messages, commands, prompts, evidence contents, and unbounded label maps
remain forbidden.
