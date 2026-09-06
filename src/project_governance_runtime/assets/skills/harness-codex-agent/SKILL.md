---
name: harness-codex-agent
description: Delegate an authorized task to Codex from Claude or another parent with shell access, full native tools, durable jobs, and progress. Use when the user requests Codex as a delegated worker or reviewer.
---

# Codex Agent

Read `.governance/runtime/skills/resources/harness-agent-operation.md` for the shared launch,
capability, continuation, and evidence contract. Use provider `codex` with an explicit installed
model ID and effort, or the host's caller-selected configuration. No model is a package default.

This adapter uses the authenticated local Codex CLI's stdio app server. `codex login` establishes
native login. It preserves ordinary native tools, skills, hooks, and configured MCP connections.
The wrapper verifies session settings and follows public response and tool events.

A Claude parent uses the same command, job ID, and event cursor as any other parent. Full access
does not clone parent-only desktop tools. Requests needing fresh user input or unavailable client
tools return a blocker; they must not hang or be silently approved.
