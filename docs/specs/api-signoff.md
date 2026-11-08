---
id: spec.api-signoff
title: Local API Signoff
type: spec
status: current
owner: project-governance
created: 2026-10-29
updated: 2026-10-30
summary: Defines exact API approval through a local native host and noninteractive ledger verification.
---

# Local API Signoff

API approval is a human decision about a frozen semantic contract. It is separate from permission
to build, run a workflow, publish, or claim native behavioral parity. Ordinary checks must not ask
for approval. A changed API requires a deliberate review and a new exact decision.

## Identity and trust

The version-1 subject contains `contractId`, `contractDigest`, explicit product/language/platform
`cells`, a complete `sections` identifier-to-digest map, and `reviewDigest`. Digests are SHA256.
The stable contract ID identifies the baseline lineage within one repository. Cells are explicit
tuples, not an inferred cross product. Ordering is immaterial; duplicate cells, omitted fields,
empty sections and unknown fields refuse. The adopting extractor owns semantic normalization,
coverage, section membership and the meaning of the contract digest. Governance checks exact
identity, not completeness or correctness of the API design.

The host reads an exact UTF-8 review artifact, verifies its byte digest, and displays its entire
text alongside all subject identities. The review is limited to 8000 bytes and the complete dialog
to 12000 characters. Oversized reviews refuse rather than truncate; divide them into meaningful
contract lineages. Control characters that obscure review refuse. A digest alone is not a readable
review. The host rechecks review bytes, subject and runtime identity after confirmation.

The production adapter observes the local OS execution UID/username, Node executable/version,
selected package version and package/export/adapter/lock digests. It generates a confirmation-event
ID and timestamp. Those fields are not request arguments. They describe the process context in
which the native dialog returned confirmation. They do not authenticate a chat account, identify
the person clicking, or resist malicious same-account writers, modified host code or UI automation.
The existing trusted-local-host boundary remains explicit. No signing key or service is introduced.

`host/v1` store mutation methods are trusted-host primitives, like existing workflow grant methods;
their TypeScript observations do not authenticate callers. Production consumers use the packaged
adapter. Its approval and revocation exports always use the private native confirmation and reject
extra callback arguments before opening the ledger. No shipped answer-provider seam exists.
Models must not invoke a mutation primitive as human consent. Same-process builtin replacement and
modified host code remain outside this trusted-host boundary; a native-kind observation is not
independent authentication of an arbitrary same-account writer.

## Ledger and lifecycle

`ApiSignoffStore` uses the existing repository Harness database. Two additive, domain-specific
tables retain immutable decision envelopes and the current receipt for each contract lineage.
There is no workflow-grant conversion, task acceptance conversion or second mutable task model.
A receipt file contains only kind, repository ID and receipt ID. Editing it cannot mint authority.
Read-only construction is the default and does not create a missing database or signoff tables.

An approval records the frozen subject and host observation. A request ID allows recovery of a
committed decision after receipt-write interruption without a second prompt. Replay requires the
same subject and predecessor and a still-current, unrevoked decision. Reusing an ID with different
inputs refuses. A revoked ID cannot revive an approval.

Replacing an active contract requires its exact receipt ID and revision. One immediate transaction
checks the current predecessor, stores the successor, marks the predecessor superseded, and changes
the current pointer. A racing replacement or revocation invalidates the stale predecessor. A new
contract lineage starts without a predecessor; it cannot inherit another lineage's approval.

Revocation records its own host observation and advances the receipt revision. It does not require
the old review artifact and can target an older superseded record without revoking its successor.
It does not terminate running processes. After revocation a new human decision may approve the
same contract again under a new request ID; old receipts stay invalid.

Verification compares the entire expected subject and checks the current pointer, revocation and
supersession in one read transaction. Missing tables, missing records, wrong repository, malformed
locators or corrupted immutable envelopes refuse. Verification is point-in-time evidence, not a
durable permission token. Consumers must verify again at packaging/publication admission and bind
the checked semantic digest to the actual artifact they use. This does not make source files or an
external publication transaction atomic with the local ledger.

## Public interface

The package exports `ApiSignoffStore`, `apiSignoffSubject`, `apiSignoffPredecessor`, and their types
through `@organta/project-governance/host/v1`. Supported methods are `replay`,
`recordConfirmation`, `verify`, `revoke`, and `close`. Only trusted hosts call mutation methods.

The packaged adapter is `dist/engine/assets/host/api-signoff.mjs`:

```text
node <selected-package>/dist/engine/assets/host/api-signoff.mjs approve --workspace ROOT --request FILE --receipt FILE
node <selected-package>/dist/engine/assets/host/api-signoff.mjs verify --workspace ROOT --request FILE
node <selected-package>/dist/engine/assets/host/api-signoff.mjs revoke --workspace ROOT --request FILE
```

All modes resolve the existing Git common ledger from the exact workspace root and check that its
runtime lock and launcher select this package. They do not accept a caller-selected database.
The installed lock uses the existing compiled JSON encoding. Confirmation is macOS-only;
verification has no dialog and accepts no confirmation callback.

Approve input has exactly `requestId`, `subject`, `reviewFile` (absolute path), and `supersedes`
(`null` or `{id, revision}`). Verify input has exactly `locator`, `subject`, and `reviewFile`.
Revoke input has exactly `locator` and `expectedRevision`. No actor/message IDs, approval Boolean,
`--yes`, stdin answer, environment bypass, or build-policy mode is supported. Success prints JSON;
refusal prints JSON on stderr and exits nonzero. Approval returns a locator and revision;
verification returns the matching subject, host observation, revision and point-in-time limitation.

## Qualification boundary

Source/store fixtures cover exact binding, read-only behavior, malformed inputs, revocation,
supersession, stale predecessor races, envelope corruption and acknowledgement recovery. Host
fixtures cover review display, cancellation, changed inputs/runtime, provenance observation,
noninteractive CLI verification and refusal of bypass arguments. Repeat host fixtures through the
exact extracted candidate package and inspect its contents. Unshipped tests may replace the OS
transport inside a synthetic process; they must not add a production answer switch. Such fixtures
prove mechanics, not actual human consent. One real native confirmation/readback remains required
before production
baseline activation; it may coincide with that baseline's actual human approval. Publication,
installation and adopting-gate acceptance are separate from local candidate qualification.
