# Default Cross-Model Delegation

Repositories adopting this runtime use the supplied harness skills by default when accessing
another model. A request such as “ask Gemini to review this” selects the repository's harness
route even when a system-level skill, plugin, or wrapper has a similar description.

| Requested provider | Installed skill |
| --- | --- |
| Gemini | `.governance/runtime/skills/harness-gemini-agent/SKILL.md` |
| Claude | `.governance/runtime/skills/harness-claude-agent/SKILL.md` |
| Codex | `.governance/runtime/skills/harness-codex-agent/SKILL.md` |

Read the selected skill, then resolve the absolute repository-local
`.governance/runtime/bin/harness-agent` command. Do not select a same-named global command through
`PATH`, a legacy consultation script, or a system plugin just because it is already installed.
Do not create compatibility aliases. Native provider binaries remain dependencies of the harness.

An explicit operator request for another route takes precedence over this default. If governing
host instructions conflict, identify the conflict instead of claiming that skill names or file
location enforce precedence. Missing harness support, credentials, quota, or tools is a visible
blocker; do not silently change wrappers, providers, models, or effort.

Same-model native subagents remain available through the parent's native controls. This default
governs cross-model access, not whether to delegate, how many agents to run, or which model a
future plan should assign. The host owns its available models, effort settings, and account access.

Bootstrap installs these instructions and maintains only its marked sections in host entry files.
After adoption or upgrade, start a fresh parent session so its startup instructions are reloaded.
`project-governance doctor` reports the installed route and incomplete setup. This inspection does
not certify that arbitrary system instructions or every host skill loader will follow the route.
