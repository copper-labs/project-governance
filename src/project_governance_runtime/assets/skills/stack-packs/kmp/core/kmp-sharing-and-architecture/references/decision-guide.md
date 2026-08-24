# Sharing and Architecture Decision Guide

Reviewed: 2026-08-24

## Separate the axes

Do not collapse these into “the platform”:

- target: compiler destination such as Android/JVM, iOS, watchOS, JS, Wasm, or native;
- source set: the compilation-sharing boundary;
- runtime profile: phone, watch, desktop, browser, server, embedded, or background service;
- artifact: application, library, framework, KLIB, or package; and
- consumer: Kotlin, Java, Swift, Objective-C, JavaScript, C, or a host framework.

Choose sharing per capability. Domain policy can be common while UI, lifecycle, sensors, storage,
and transport stay platform-owned. A mixed posture is valid when each boundary has one owner.

## Architecture alternatives

| Posture | Prefer when | Cost to expose |
| --- | --- | --- |
| Shared logic | Native experience matters and policy duplication is the main problem. | More host integration and parity proof. |
| Shared presentation | State and actions are stable across hosts but rendering stays native. | Lifecycle and effect projection need contracts. |
| Shared Compose UI | Product behavior and UI can genuinely converge across supported Compose targets. | Native conventions, experimental surfaces, and target-specific UI proof remain. |
| Headless shared runtime | Several languages or frameworks consume one policy engine. | Public artifact, lifecycle, and transport contracts become first-class. |

For high-rate data, reduce before crossing a language or process boundary. Prefer commands plus
bounded state/results over raw frame, sensor, or callback floods. Measure cadence, payload size,
queue depth, latency, drops, CPU, and memory when performance is material.

## Wearable topology

Record standalone, companion, or hybrid operation; authoritative state owner; offline commands;
reconnect reconciliation; sensor provenance and freshness; background limits; power budget; and
what still works without the phone. Missing data should become typed degraded state, not a crash or
an invented healthy reading.

## Primary sources

- Kotlin project structure: https://kotlinlang.org/docs/multiplatform/multiplatform-discover-project.html
- Supported-platform stability: https://kotlinlang.org/docs/multiplatform/supported-platforms.html

Platform stability and shared-UI stability are separate. Recheck both before making a support claim.
