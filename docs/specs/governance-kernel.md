---
id: spec.governance-kernel
title: Governance Runtime Specification
type: spec
status: current
owner: project-governance
created: 2026-03-02
updated: 2026-08-24
summary: Contract for the package runtime, its configuration boundary, focused execution model, and bounded local telemetry.
---

# Governance Runtime Specification

## Purpose

`project-governance-runtime` is a Python package exposing the `project-governance` CLI. It runs
generic repository checks without absorbing product policy or duplicating build systems.

## Commands

```text
project-governance check --stage <stage> --mode impacted
project-governance check --stage <stage> --mode impacted --summary
project-governance check --pack <pack-id>
project-governance check --pack <pack-id> --stage <stage> --mode impacted
project-governance check --stage pre-pr --mode all
project-governance plan --stage <stage> --mode impacted --json
project-governance plan --pack <pack-id> --stage <stage> --mode impacted --json
project-governance context --task <description> --json-output <ignored-result.json>
project-governance doctor
project-governance telemetry status
project-governance init
project-governance docs init --dry-run
project-governance docs route --capability <id-or-alias> --json
project-governance docs route --symbol <exact-symbol> --json
project-governance update --to <version> --dry-run|--apply
```

`check` emits normalized findings and a stable exit code. `plan` explains selected and omitted
packs without running them. Their optional `--summary` projection omits path inventories, command
lines, and process output while retaining bounded active findings; default output and
`--json-output` remain full machine receipts. `doctor` reports a missing or invalid integration plainly. `init`
creates only missing integration files. `update` advances the runtime lock only after required
target-owned configuration is ready; schema changes remain blocked in dry-run output until an
operator deliberately applies the reviewed lock. The runtime does not carry historical
configuration migrations or predecessor-cleanup rules.

`context` selects and materializes exact route-owned context and skill bytes. Each packet is capped
at 256 KiB including skills, and the runtime retains at most eight ignored packets. Interrupted
runtime staging directories are removed under the same local materialization lock. Delegation
remains a host-agent concern: the wheel owns no launch state,
provider catalog, writer lease, role receipt, retry loop, or per-skill closeout workflow.

Stages remain command boundaries, not selectable profiles:

| Stage | Subject |
| --- | --- |
| `commit-msg` | Commit-message policy only |
| `pre-commit` | Staged index subject, including staged-only secret bytes |
| `pre-push` | Branch-aware impacted subject; live publishable worktree-and-index secret scan |
| `pre-pr`, `ci-pr` | Branch-aware impacted subject; live publishable worktree-and-index secret scan |
| `release` | Explicit all-mode checkout-wide subject |

`--mode all` is the explicit exception to packet-only file reads: it authorizes selected packs to
inspect the current checkout across their declared full scope. It is not a lifecycle profile or a
repair shortcut, and a named pack does not expand into all packs.

The installed pre-PR hook composes `--pack pr-description` with `--stage pre-pr --mode all`.
Because that checker reads only its title and body inputs, the all-subject envelope removes an
irrelevant branch-comparison dependency without widening pack selection. This keeps local
pull-request authoring fail-closed without replaying the branch-aware pre-push sign-off. The
generic stage remains available for a deliberate adopter-owned boundary.

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
  proof relationships. After manifest inspection it removes only an empty pack directory and empty
  run parent that it created. Any target-written file leaves that directory untouched.

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
`replaces_builtin_packs` declarations. Every active pack must have at least one applicable command
for each stage it declares. Planning blocks a selected blocking pack when that requested-stage
claim is empty, and execution fails the pack if it still resolves to zero runnable commands.

## Selection And Execution

The planner accepts changed paths, one or more named packs, or an explicit all-files boundary. It
resolves dependencies, rejects cycles, and emits one selector finding for an unmapped path. Normal
work is changed-path based. Named pack selection is independent from lifecycle stage and change
scope, so focused repair can retain the same staged, branch-aware, explicit-path, or all subject
without admitting unrelated packs or commands.

The runner owns process groups, interruption, child cleanup, finding normalization, and JSON
output. Duration policy belongs to the target repository or operator. The runner imposes no default
deadline, but an explicitly supplied timeout remains blocking and terminates the owned process
group. It does not maintain a second cache around a repository's build, test, device, or language
tool. It resolves one immutable change packet before execution and supplies one run ID and one
isolated evidence root per selected pack.

The runtime owns no evidence-retention policy. It prunes only its empty directory scaffolding;
nonempty evidence remains target-owned and must be retained or removed by target policy.

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
waiver remains bound to exact bytes, current metric, expiry, and remediation plan. When necessary
work changes waived source without resolving the finding, an explicit reviewed replacement may
bind the new exact bytes and metric only by naming the superseded fingerprint and including the
governed source in the immutable change packet. Completed
remediation exits through an inert reviewed `waiver-resolved` record that names the same exact
waiver fingerprint and never authorizes a future finding. Both transitions preserve responsibility
and carry a named reviewer, valid non-older approval date, and rationale. Unbound refresh, silent
deletion, ambiguous replacement, expiry, stale evidence, and unreviewed weakening remain blocking.
A selected source with no remaining matching finding must take the reviewed resolution exit. A
version-1 decision never authorizes a pass and produces one grouped migration obligation.

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

Telemetry is one ignored validation JSONL file bounded by both 1,000 records and one mebibyte. It
records only run identity, runtime version, stage, mode, non-reversible scope and subject digests,
changed-path and selected-pack counts, terminal status and reason, total duration, total pack
duration, and the ten slowest pack IDs with durations. It never records paths, commands, output,
findings, prompts, documentation activity, skill activity, agent activity, or source content.
Writes are concurrency-safe and fail open; telemetry cannot weaken or approve a check. The single
`telemetry status` view reports retained bytes, outcomes, durations, runner overhead, modes, broad
runs, repeated scopes and subjects, unmatched starts, and slow packs. It does not declare a run
hung or a repeat unnecessary.
