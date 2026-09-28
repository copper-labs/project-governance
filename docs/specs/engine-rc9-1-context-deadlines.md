---
id: spec.engine-rc9-1-context-deadlines
title: Context Decision Deadline Correction
type: spec
status: active
owner: project-governance
created: 2026-09-28
updated: 2026-09-28
summary: Give context decisions one operation deadline instead of a separate one-second provider cap.
---

# Context decision deadline correction

RC9 retained a one-second HTTP cap for each JEV metadata and passage request. That cap was a local
latency choice, not a provider limit. The 30-second retrieval operation and its delivery reserve
already bound the user-visible wait. On a large permitted inventory, valid requests that took more
than one second were recorded as provider failures, triggered a local cooldown, and prevented later
batches from being assessed. Smaller batches sometimes answered but reduced coverage.

For context metadata and passage requests, the existing 30-second operation limit is the only
time allowance. An explicit caller deadline can shorten it. A request cannot renew that deadline. At the
selection cutoff, abort its owned work, settle the request, retain spent-call accounting, and return
valid completed answers plus deterministic fallback. Treat this caller cutoff as a local limit, not
as evidence of provider failure or a reason for provider cooldown. A response that arrives after
one second but before the caller cutoff may be used if its identity and schema validate.

Other decision consumers keep their configured `deadline_ms`. A context call without an explicit
operation deadline receives the same 30-second safety limit. This change does not expand source disclosure,
JEV spending, concurrency, the 30-second operation, the 40-second host hook, or model delegation.
No new timeout setting or compatibility path is introduced.

The urgent RC9.1 release is packaged and published without CI or test-suite qualification at the
operator's request. Later qualification should cover a delayed valid response, an unresponsive
request at the caller cutoff, cancellation, budget ownership, and a subsequent call after local
cutoff. Normal adopter prompts and accepted outcomes remain separate evidence; shorter or fuller
packets alone do not establish time or token savings.
