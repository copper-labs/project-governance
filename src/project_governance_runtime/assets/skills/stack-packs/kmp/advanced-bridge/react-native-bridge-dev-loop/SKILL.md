---
name: react-native-bridge-dev-loop
description: Use when developing or debugging a React Native host that bridges into KMP/native runtime code. Focuses on native module/view manager boundaries, event emitter semantics, app proof, Metro/native build loops, and avoiding host-owned shared policy.
---

# React Native Bridge Dev Loop

## Trigger

Use this skill when a React Native app or package changes native modules, view managers, event emitters, Turbo/JSI surfaces, TypeScript facades, native build settings, or a KMP-backed runtime bridge.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles for React Native, Android, iOS, TypeScript, and KMP
- existing native module/view manager and TypeScript facade patterns
- bridge architecture docs and validation packs
- current app launch, Metro, simulator/device, and E2E commands

## Workflow

1. Classify the change as TypeScript facade, native shell, shared bridge support, KMP runtime, app proof, or build tooling.
2. Keep RN native modules and view managers thin. They may own registration, transport, event emitter wiring, view attachment, permissions, and lifecycle callbacks only.
3. Keep command legality, readiness, event ordering, lifecycle terminal semantics, upload timing, and observability policy in KMP/shared bridge support.
4. Run the fastest changed-side check first: TypeScript tests for facade changes, Android/iOS native build for native changes, common KMP tests for shared semantic changes.
5. Launch the smallest proof app that exercises the changed bridge path, not just package compilation.
6. Inspect event emitter registration, listener cleanup, stale-run rejection, and app unmount/remount behavior for bridge changes.
7. Record whether proof came from Android, iOS, both, simulator, device, or web/RN-web if relevant.

## Validation

Run target TypeScript lint/tests, Android/iOS native build checks, KMP tests for shared semantics, bridge contract tests, and RN E2E smoke flows required by the target profile.

## Evidence

Report changed layer, public facade effects, native shell responsibilities, runtime/shared owners touched, launch/E2E proof, validation commands, and remaining host parity risks.
