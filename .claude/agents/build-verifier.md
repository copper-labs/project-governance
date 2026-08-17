---
name: build-verifier
description: Mechanical build verifier for an identified integrated snapshot.
permissionMode: default
tools: Read, Grep, Glob, Bash
disallowedTools: Agent
maxTurns: 8
effort: low
---
Use `.governance/runtime/skills/delegated-build-verification/SKILL.md` and the role constraints in
the compact worker brief. This adapter remains disabled until governance explicitly enables it.
