# Default cross-model delegation

Use the project's selected compiled runtime for cross-model work unless the operator explicitly
chooses another route. Provider skill IDs remain `harness-codex-agent`, `harness-claude-agent` and
`harness-gemini-agent`. Read their packaged bodies with `skill-read --path <skill-id>/SKILL.md`.
Use the absolute repository-local `.governance/runtime/bin/project-governance` launcher.

Before delegation, run `provider-help` for the current assignment, observation, continuation and
cleanup contract. Native provider binaries, tools and authentication remain provider-owned.
Preserve the requested provider, model, effort, scope and restrictions. Missing support, credentials,
quota or tools requires an explicit resolution; do not silently substitute a global wrapper or model.

This route does not authorize delegation or increase team size. The parent's native same-model
controls remain available within the operator's and host's authority. Read model-selection guidance
with `skill-read --path resources/model-selection.md`; the host owns actual model availability.
Higher-priority host restrictions still apply. Resolve conflicts explicitly.

Installation updates only managed host sections and preserves authored instructions. Reload the
parent's instructions after a qualified transition. `doctor` reports installation mismatches; it does
not prove that every host loader follows the selected route. Native hooks also require their own
project and exact-definition trust. Workers must return installation mismatches to the parent.
