---
id: proposed.repository-service-protocol
title: Repository Content-Service Protocol
type: spec
status: deferred
owner: project-governance
created: 2026-04-17
updated: 2026-08-11
summary: Deferred contract ideas for a repository client that consumes verified governance snapshots.
---

# Repository Content-Service Protocol

Markdown remains the current authority. This protocol is not active: there is no service, client,
runtime, migration, shadow mode, activation, release, or implementation.

## Future Protocol Shape

A future repository client should advertise its capabilities, request a bounded snapshot, verify its
integrity and compatibility, and use the result only for the requested operation. Responses should be
typed and include stable failure categories so a repository can distinguish unavailable service,
unauthorized access, incompatible content, invalid integrity, and operator action required.

## Requirements To Revisit

- Include request scope, client capability, and content-schema compatibility in every exchange.
- Make snapshot integrity, expiry, provenance, and rollback material verifiable locally.
- Avoid provider-native payloads and avoid persistent dual authority.
- Spool non-authoritative result uploads safely when a service is unavailable.
- Define availability, recovery, privacy, and audit behavior before implementation.

The repository must retain a usable local recovery story; a future service cannot make ordinary
development dependent on an unbounded remote call.
