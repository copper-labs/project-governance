---
id: exec-plan.provider-aware-agent-orchestration
title: Provider-Aware Agent Orchestration
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-16
updated: 2026-08-16
summary: Implement native-host routing with compact briefs, one-wave authorization, and terminal-only telemetry.
---

# Provider-Aware Agent Orchestration Implementation Plan

## Outcome And Boundary

Implement the [provider-aware orchestration specification](../../specs/provider-aware-agent-orchestration.md)
without adding model clients to the runtime kernel. Codex routes only to Codex profiles; Claude Code
routes only to Claude profiles. The native primary remains coordinator and integrator. Solo remains
the default.

Version 1 excludes local models, standalone and cross-provider operation, parallel writers, nested
delegation, specialist retries, price-based routing, automated review scheduling, conditional
multi-stage authorization, and build-agent enablement.

The operator explicitly authorized source implementation. Wheel publication, remote push, release,
and adopter writes remain outside this plan.

The authoring baseline is
`codex/governance-v1.1-evidence-integrity@20a9705a8c9a4b63a9ae70a6aca75190c8c3741e`.
Implementation was completed on the existing `codex/governance-v1.1-evidence-integrity` branch
after the local documentation checkpoint `07261d8`.

## Implementation Decisions

- Migrate the existing Version 3 execution/context contract in place. Do not create a second packet
  authority or change the behavior of `project-governance context`.
- Use the dated model chart in the specification as the only Markdown copy of concrete model names.
- Fold the execution-plan lifecycle correction into the contract migration rather than creating a
  standalone slice.
- Leave the existing build-verifier role disabled; align only its shared-contract wording and add no
  Version 1 profile or launch fixture for that role.

All routing, authorization, concurrency, failure, and telemetry policy lives in the specification
and is not restated here.

## Execution And Proof Budget

Implementation is sequential unless a future packet explicitly proves otherwise. No slice requires
a subagent merely because the resulting feature supports specialists.

| Claim | Cheapest sufficient evidence |
| --- | --- |
| Version 3 migrates without a second context authority | Existing context-command regression tests plus Version 4 envelope/projection fixtures |
| Models receive only the compact brief | Serialization and forbidden-control-field tests |
| Router is deterministic and tier-based | Codex/Claude, tier, readiness, scope, writer-lease, and solo-fallback tables |
| Dispatch writes are explicit and fail closed | Start/finish CLI, atomic-state, lease-expiry, crash, and corruption tests |
| Telemetry has negligible marginal overhead | One-terminal-write, sanitizer, malformed-record, and bounded status tests |
| Installed wheel remains provider-neutral | Installed-skill and wheel-boundary inspection |

Run each slice's focused proof and one directly affected integration seam. Run the broad runtime and
clean-wheel proof once on the stable final candidate.

## Slice 1: Migrate The Existing Contract And Planning Surface

- Depends on: none
- Ownership: execution roles, context-envelope projection, shared schemas, plan template, skills,
  native adapter text, and execution-plan lifecycle validation
- Execution: sequential
- Required capability: primary
- Fixed decisions: existing context materialization remains authoritative; compact brief is a
  worker-visible projection
- Acceptance: Version 4 has one writer, no `parallel-isolated` mode, optional provider usage, one
  compact brief, and no nonexistent target-policy read
- Focused proof: context regressions, schema/projection tests, installed-skill tests, and lifecycle
  validator regression
- Escalate or stop when: migration would require a compatibility shim, second packet authority,
  provider object, credential, prompt body, or machine path
- Packet ready: yes

**Changes**

- Correct the lifecycle validator from `type: plan` to `type: exec-plan`, add one regression test,
  and activate explicit active-plan index validation in the same change.
- Version `execution-roles.yaml` from 3 to 4 as an explicit migration:
  - remove `parallel-isolated` and the multiple-writer invariant;
  - retain the existing context packet identity, materialization, and provider fields host-side;
  - change real provider usage from prohibited to optional;
  - add `required_capability_tier` and the worker-brief projection; and
  - remove the nonexistent `docs/governance/delegated-execution.md` optional-policy path.
- Add three schemas only:
  - routing input/output, including host identity and catalog definitions;
  - compact worker brief; and
  - dispatch authorization/control state.
- Keep the result envelope in `execution-roles.yaml`; do not create a duplicate result schema.
- Add one canonical implementation-plan template using the compact slice contract. Remove the
  redundant `Parallel safe` field.
- Update planning, delegated execution/research/implementation/QA, work, and review skills together.
  Do not update the dormant build-verifier role beyond wording needed for the shared contract.
- Correct `.claude` and `.codex` adapter pointers that still reference nonexistent
  `template/agent-context/**` paths or the old model-visible task envelope.
- Prove `project-governance context` selects and materializes the same bounded items before and after
  the migration; only the host-to-worker projection changes.

## Slice 2: Add Tier Routing And Explicit Dispatch State

- Depends on: Slice 1
- Ownership: pure router, `agent-route`, `agent-dispatch start|finish`, shared state-I/O helpers,
  ignored control state, and thin native-host adapters
- Execution: sequential
- Required capability: primary
- Fixed decisions: same-provider tier mapping; one launch wave; one repository delegated-writer
  lease; no price arithmetic
- Acceptance: the router cannot launch or write; start and finish are the only state/telemetry write
  boundaries; ordinary failure returns to primary solo without re-dispatch
- Focused proof: routing tables, command contracts, authorization lifecycle, writer lease,
  fail-closed state, deadline expiry, and fake-adapter tests
- Escalate or stop when: selection requires semantic judgment or an adapter cannot enforce scope,
  cancellation, or token ceilings
- Packet ready: yes

**Changes**

- Add a pure native-host identity/catalog resolver. The catalog is an explicit router input; missing
  or invalid input returns solo.
- Capture one evaluation instant at each route, start, and finish command entry and make it
  injectable in tests. Use it for every deadline comparison in that invocation; route emits its
  instant as the request's `issued_at`.
- Map and compare the native catalog's increasing-capability profile ranks exactly as specified.
  Include the current session profile rank in routing input; assurance uses the specification's
  rank exemption.
- Validate packet readiness, role, permission, privacy, scope, profile eligibility, critical
  suspension, token ceilings, and the repository writer lease. Do not estimate currency or savings.
- Add the read-only route command and two explicit write interfaces:

```text
project-governance agent-route --task <envelope> --session <identity> --catalog <catalog> --json
project-governance agent-dispatch start --request <route-request> --json
project-governance agent-dispatch finish --authorization <digest> --results <result-bundle> --json
```

- `start` records one exact launch wave and returns its native entries without launching them. Use
  the request-expiry contract from the specification.
- `finish` applies the specification's terminal and invalid-authorization rules and exposes one
  terminal hook that Slice 3 wires to telemetry.
- Extract telemetry's private atomic-write and lock logic into one shared state-I/O module. Preserve
  existing telemetry behavior with regression tests before reusing the helpers.
- Add `.governance/state/agent-control.json` for authorization/entry state, active deadlines,
  repository writer lease, and critical suspensions only. Apply the specification's expiry, lease,
  late-finish, and terminal-retention rules exactly; keep routing read-only.
- Retain authorization identities exactly as specified. Treat the catalog digest as routing input,
  not another retained authorization identity.
- A `needs_primary_decision`, provider failure, or budget exhaustion terminates the entry. The
  primary completes the remainder solo; no automatic re-route or second prompt occurs.
- Apply the specification's non-completed-writer handling exactly.
- Use fake launchers in source tests. No source test calls Codex or Claude.

## Slice 3: Add One Terminal Receipt And Bounded Model Mix

- Depends on: Slice 2
- Ownership: existing telemetry allowlists, one terminal event, fail-open status aggregation, and
  delegated-model-mix output
- Execution: sequential
- Required capability: primary
- Fixed decisions: one receipt per launch wave; retained model counts/percentages and reported token
  totals only
- Acceptance: malformed records are skipped; telemetry cannot approve work, hold a lease, or weaken
  suspension; status adds no model call, network request, background job, or write
- Focused proof: sanitizer, redaction, one-write, malformed-record, retained-window, and telemetry-
  failure tests
- Escalate or stop when: reporting would require content, prices, estimated savings, or subjective
  scoring
- Packet ready: yes

**Changes**

- Add `orchestration-terminal` to the existing hand-written telemetry allowlist and add one bounded
  entry sanitizer; do not add a receipt JSON schema.
- `agent-dispatch finish` appends one record containing role, model/profile, terminal outcome,
  duration, optional reported input/output tokens, proof result, and fallback/repair flags.
- Do not persist intermediate events, prices, spend, savings, usage coverage, tool counts,
  compactions, concurrency, first-pass acceptance, or coordinator-rework scores.
- Make `telemetry status` fail open on malformed orchestration data. Report the bounded retained
  model mix and label its exclusions exactly as specified, including control-state-only timeouts and
  evicted receipts.
- Add no review scheduler, `review_due` state, or durable experiment counter. The operator may inspect
  the first ten completed tasks or first 30 days manually as the specification's best-effort
  retained sample, without recurring prompts.

## Slice 4: Enable Conservative Profiles And Reconcile Authority

- Depends on: Slices 1–3
- Ownership: tier/profile enablement, authoritative docs, synthetic target, and wheel proof
- Execution: sequential
- Required capability: primary
- Fixed decisions: concrete names remain in the specification chart and native catalogs; build
  agents remain disabled
- Acceptance: one discoverable contract ships; disabling orchestration leaves solo unchanged
- Focused proof: profile fixtures, synthetic end-to-end route, documentation/prose gates, runtime
  suite, and clean-wheel inspection
- Escalate or stop when: a profile needs weaker controls, implementation needs a provider client, or
  routing overhead is material
- Packet ready: yes

**Changes**

- Enable economy first, then balanced implementation/research/QA profiles using the single chart in
  the specification. Do not repeat concrete model names here or in neutral policy.
- Leave build-agent profiles disabled. The harness runs deterministic build/test commands and the
  primary consumes bounded results.
- Update runtime architecture, kernel, system spine, operator guidance, validation strategy, and
  indexes only for implemented behavior.
- Add source fixtures covering both native hosts, economy/balanced/primary mapping, missing
  identity/catalog, readiness failure, assurance, writer contention, lease expiry, critical
  suspension, provider failure, malformed telemetry, and solo fallback.
- Inspect the wheel for credentials, launch commands, provider clients, local-model support, stale
  adapter paths, and duplicate policy.
- Move this plan to `completed/` only after source proof passes.

**Stable-candidate proof**

```sh
python3 -m unittest discover -s tests -p 'test_runtime_*.py'
python3 -m pip wheel . --no-deps --wheel-dir dist
python3 tools/verify-runtime-wheel.py dist/project_governance_runtime-*.whl
tools/run-source-governance.sh check --stage pre-commit --mode impacted --staged
```

Run the directly affected pre-PR boundary once before publication. Publication, push, release, and
adopter updates remain separate operator decisions.

## Closeout Evidence

- Focused orchestration, contract, telemetry, context, documentation, and payload proof: 53 tests
  passed.
- Broad runtime proof: 203 tests passed with one pre-existing skip.
- Impacted pre-commit governance proof: eight selected packs passed with zero findings.
- Impacted pre-PR governance proof: eight selected packs passed with zero findings.
- Fresh wheel proof: installed-wheel target checks passed, including synthetic Codex and Claude
  route, authorization, and completion flows without provider calls.
- Wheel boundary inspection confirmed the routing modules, three approved schemas, and planning
  template are present; the scoped orchestration surface contains no provider credentials, provider
  clients, provider launch commands, local-model support, or stale adapter paths.

## Acceptance And Rollback

- All specification acceptance criteria pass.
- The shipped context command remains authoritative and workers see only the compact projection.
- Tier and packet-readiness choices are primary-owned; the normalized route decision is mechanical
  and stable for identical envelope, session, catalog, control state, and evaluation-instant inputs.
  Volatile request times remain outside the normalized decision body.
- One writer lease protects the checkout across concurrent delegated sessions.
- Start/finish commands are the only orchestration write boundaries.
- Specialist failure returns to primary solo without another authorization loop.
- Telemetry performs one terminal write and reports retained model mix without cost overclaims.
- Removing the feature leaves the existing solo workflow unchanged.

Rollback adapters before routing/control and routing before the Version 4 contract. Do not create a
compatibility shim or second packet authority. If retained receipts do not show useful delegation,
return the profile to solo-only rather than adding more agents or metrics.

## Progress

- [x] Research and provider comparison
- [x] Simplified governing specification
- [x] Simplified implementation plan
- [x] Claude Opus 5 simplicity and execution-cost review
- [x] Slice 1: Version 4 contract and planning migration
- [x] Slice 2: tier routing and explicit dispatch state
- [x] Slice 3: terminal-only retained model mix
- [x] Slice 4: profile enablement, authority reconciliation, and wheel proof
