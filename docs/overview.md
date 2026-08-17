---
id: docs.overview
title: Overview
type: guide
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-11
summary: Explains the reusable package runtime and its project boundary.
---

# Overview

This repository builds a generic governance runtime for repositories that need focused quality
checks, consistent findings, and shared agent guidance without copying a large script tree.

It owns the wheel, generic packs, standard schemas, generic skills, and documentation. An adopting
repository owns its runtime lock, policies, source mappings, project checks, and product evidence.

The runtime is intentionally small: ordinary package tooling, exact artifact verification,
changed-path selection, direct language-tool invocation where helpful, and bounded local telemetry.
It does not own customer projects or automatically modify them.
