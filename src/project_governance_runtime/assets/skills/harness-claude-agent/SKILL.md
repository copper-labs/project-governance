---
name: harness-claude-agent
description: Delegate an authorized task to Claude Code with full native tools, durable jobs, and progress. Use when the user requests Claude work or an independent Claude review.
---

# Claude Agent

Read `.governance/runtime/skills/resources/harness-agent-operation.md` for the shared launch,
capability, continuation, and evidence contract. Use provider `claude` with an explicit installed
model ID and effort selected through `.governance/runtime/skills/resources/model-selection.md`.
The helper itself has no implicit model default.

This adapter uses authenticated Claude Code (`claude`). `claude auth status --json` checks login;
`claude auth login` establishes it interactively. Preserve ordinary native tools, skills, hooks,
and configured MCP connections. The adapter disables fallback for this invocation and checks
reported model identity. A QA or architecture role retains the same tools as a coding role.

Use the harness wrapper's exact installed command. Do not use bare, restricted, plan-permission,
or text-only modes as a substitute for the authorized assignment.
