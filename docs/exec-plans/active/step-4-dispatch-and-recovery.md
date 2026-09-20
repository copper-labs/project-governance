# Qualify execution and recovery

Status: planned qualification/experiment after the architecture reset. Updated 2026-09-19.

The public governance batch adapter is implemented. Qualify the installed immutable runtime artifact and supported host lifecycle, including lost submit replies, pending/terminal observations, interruption, cleanup failure, late results after task revision and stale input manifests. Never duplicate supervision or rerun an uncertain job. Host edits stay host-owned. Local source CLI tests establish protocol behavior only.

Follow the [current contracts](../../specs/README.md) and [roadmap](../README.md).
Completion requires recorded evidence, not source presence.
