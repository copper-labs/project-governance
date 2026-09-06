---
name: gemini-agent
description: Delegate an authorized task to Gemini through Antigravity with full native tools, durable jobs, and progress. Use when the user requests Gemini work or an independent Gemini review.
---

# Gemini Agent

Read `.governance/runtime/skills/resources/provider-agent-operation.md` for the shared launch,
capability, continuation, and evidence contract. Use provider `gemini` with an explicit installed
model ID and effort, or the host's caller-selected configuration. No model is a package default.

This adapter uses authenticated Antigravity CLI (`agy`). `agy models` lists current selections;
an interactive `agy` session establishes login. Keep native tools, rules, and configured MCP
connections. A role such as QA describes the task without restricting tools.

Use the governance wrapper's exact installed command. Do not substitute a direct model API,
text-only consultation, or a different provider when the requested route is unavailable.
