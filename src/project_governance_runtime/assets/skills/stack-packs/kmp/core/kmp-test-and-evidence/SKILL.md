---
name: kmp-test-and-evidence
description: Match KMP common, target, bridge, host, artifact, device, and wearable evidence to the exact behavior and support claim under review.
---

# KMP Test and Evidence

Use this skill when defining tests, reviewing parity, fixing a cross-target regression, or making a
support, performance, artifact, bridge, or wearable claim.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-test-and-evidence/references/decision-guide.md`
to map claims to proof tiers.

## Build the proof matrix

1. State the behavior and target rows being claimed. Separate source portability, compilation,
   public contract, artifact consumption, runtime behavior, UI behavior, performance, and device
   behavior.
2. Put deterministic shared policy tests in `commonTest`; run them through every supported target
   runner that matters. Add intermediate or platform tests for platform implementations and APIs.
3. Reuse contract fixtures across language and host bridges. Verify DTO fields, ordering, terminal
   outcomes, cancellation, duplicate/stale rejection, error mapping, and lifecycle release.
4. Add artifact-consumer proof when distribution or exported APIs change. Compilation inside the
   producer is not consumer proof.
5. Use simulator/emulator evidence only for claims it can support. Sensors, backgrounding,
   disconnect/reconnect, power, architecture slices, and device performance may require physical
   hardware or an explicit residual gap.
6. Record exact commands, environment and toolchain, artifact digest, target, device tier, outcome,
   and skipped rows. Preserve failure evidence without converting it into a passing claim.

## Wearable cases

Exercise standalone and companion authority, missing/stale sensor input, disconnect/reconnect,
queued command replay, duplicate rejection, background/foreground transitions, and bounded resource
use. A phone test is not watch proof.

## Stop conditions

Stop when a supported target has no runnable proof owner, a bridge uses host-local fixtures that can
drift from the shared contract, or the evidence does not identify the exact built artifact.
