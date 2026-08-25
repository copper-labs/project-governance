# Test and Evidence Decision Guide

Reviewed: 2026-08-24

## Claim-to-proof map

| Claim | Minimum relevant evidence |
| --- | --- |
| Common policy | Deterministic `commonTest` behavior plus supported target runners. |
| Platform implementation | Owning platform source-set tests and affected integration seam. |
| Public bridge contract | Shared fixtures replayed through each supported binding, including lifecycle and errors. |
| Artifact compatibility | Exact artifact digest, surface/slice inspection, and a real consumer build. |
| UI behavior | Target UI test or host E2E at the claimed tier. |
| Performance | Named workload, device/host, warmup, repetitions, percentiles, resource counters, and baseline. |
| Wearable/device behavior | Physical or explicitly qualified simulated proof for sensors, lifecycle, reconnect, power, and performance. |

Common tests use platform-neutral APIs, but they still execute through target-specific runners. Run
the targets that support the claim. Add platform tests for platform services and framework tests for
consumer-visible behavior.

## Bridge contract cases

Use one canonical fixture vocabulary across bindings. Cover schema/defaults, state replay, event
ordering and sequence, duplicate observation, cancellation, stale-generation rejection, slow
consumer/overflow, stable error mapping, close during an admitted callback, resource release, and
reconnect reconciliation. Host-local mirrors and separate fixtures are drift risks.

For wearable companions, test authority during partition, offline mutation, queue limits, replay,
conflict resolution, duplicate rejection, stale sensor input, background/foreground, and degraded
operation without the phone.

## Primary sources

- KMP common and platform testing:
  https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html
- Project test source sets and target tasks:
  https://kotlinlang.org/docs/multiplatform/multiplatform-discover-project.html
- Compose Multiplatform UI testing:
  https://kotlinlang.org/docs/multiplatform/compose-test.html

Experimental test APIs and target support change. Record the reviewed source date and exact task
instead of treating one generic `test` command as all-target proof.
