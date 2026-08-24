---
name: kmp-sharing-and-architecture
description: Choose KMP sharing, ownership, UI, host-shell, and device-authority boundaries across mobile, desktop, web, server, native, and wearable targets.
---

# KMP Sharing and Architecture

Use this skill before adding modules, shared UI, platform bridges, or wearable companions when the
sharing posture or runtime authority can change the design.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-sharing-and-architecture/references/decision-guide.md`
when comparing postures or device topologies.

## Make the decisions

1. Write the target and consumer matrix. Mark each row primary, conditional, experimental, or
   unsupported; do not let one stable target imply another is supported.
2. Choose the smallest sharing posture that removes real duplication: shared logic, shared
   presentation, shared Compose UI, headless shared runtime with native UI, or an explicit mix.
3. Assign one owner for policy and durable state. Host shells translate lifecycle, transport, view,
   and platform services; they do not recreate shared policy.
4. For high-cadence streams, keep sampling, ordering, reduction, and backpressure on the native or
   KMP side. Cross host boundaries with bounded commands, state snapshots, results, and diagnostics.
5. For companion or wearable systems, decide where authority lives while disconnected, which
   commands can be replayed, how conflicts resolve, and how stale or missing sensor context degrades.

## Reject these shortcuts

- universal `commonMain` placement without checking dependency and target constraints;
- shared UI as a goal independent of native interaction, accessibility, performance, or staffing;
- a host-local state mirror that can diverge from the shared owner;
- phone-owned lifecycle or continuous connectivity as an undeclared wearable assumption; and
- framework complexity introduced for a single consumer with no measured boundary pressure.

## Evidence

Record the selected posture and rejected alternative, policy/state owner, thin-host responsibilities,
offline and reconnect behavior, and proof per supported target. Stop if target tiers, artifact
consumers, or device authority remain unknown.
