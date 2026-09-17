# Select A Model And Reasoning Effort

Use this policy when planning an authorized assignment or choosing a model for a new task.
It does not authorize delegation, change the running parent model, or launch a provider.
The coordinator interprets this Markdown; the CLI does not parse or enforce the table.

## Precedence

Apply the operator's explicit task choice first, then the adopting repository's optional
`config/governance/model-selection.md`, then the default table below. Higher-priority host
instructions, permissions, available models, and supported effort values remain constraints.
Do not treat an ambient host default as an explicit operator choice.

Read the project file if it exists before selecting a row. Use the task's uncertainty and the
consequences of error to select a work class; role names alone do not select models. Record the
chosen class, exact model, effort, and selection source in the existing assignment or plan.
Use that concrete pair when dispatching so a provider configuration cannot silently replace it.

An explicit task choice overrides the fields it names. Preserve other selected fields only when
compatible. For example, a model-only request may retain the selected effort if that model supports
it. If compatibility or the intended provider is unclear, resolve that choice before dispatch.

## Default Table

These are provisional starting recommendations, informed by operator experiments rather than
comparative benchmarks. They are overlapping choices, not an escalation ladder. The model IDs
below use the Codex host; they do not select an access route or assert account availability.

| Work class | Assignment | Model | Effort |
| --- | --- | --- | --- |
| routine | Clear, routine, bounded work | gpt-5.6-luna | high |
| difficult-implementation | Difficult implementation with a well-understood approach | gpt-5.6-luna | xhigh |
| ambiguous-integration | Ambiguous integration across components | gpt-5.6-terra | high |
| diagnosis-review | Difficult diagnosis or consequential review | gpt-5.6-sol | medium |
| deep-reasoning | Hard problems needing deeper reasoning | gpt-5.6-sol | high |
| major-planning | Major planning decisions or unresolved difficult problems | gpt-6-astra | low |

Within these starting recommendations, difficult-implementation may use `max`, and major-planning
may use `medium`, when the assignment warrants it. State the reason in the existing plan. A project
row or explicit task choice replaces these default alternatives as well as the starting pair.

## Project Overrides

The project owns `config/governance/model-selection.md`. Keep it tracked outside the ignored
runtime directory; installation and upgrades must not create or rewrite it. No file means use the
defaults. To override individual rows, use this shape:

```markdown
# Project Model Selection

Mode: merge

| Work class | Model | Effort |
| --- | --- | --- |
| routine | gpt-5.6-terra | medium |
| diagnosis-review | gpt-5.6-sol | high |
```

`merge` replaces each named row's complete model-and-effort pair and retains other defaults.
Use `Mode: replace` to discard the default table entirely. In replacement mode, an omitted class
has no selection: obtain an explicit task choice or a project policy correction before dispatch;
never fill it from the discarded defaults. An explicit complete task choice can resolve that gap.

Use the six work-class IDs above, one row per class, and concrete model and effort values supported
by the intended host. A project may choose another provider's models. Do not use blank cells,
multiple alternatives in one cell, duplicate classes, or an unknown mode. An unreadable or
ambiguous project policy is a visible selection blocker, not permission to ignore it. A complete
explicit task choice may resolve the affected assignment without rewriting the project file.
Project overrides take effect when the coordinator next selects an assignment; they do not
restart or switch progressing workers. Send relevant changed instructions to affected workers.

## Availability And Cost

Confirm the selected model and effort are available through the actual host before launch. If
unavailable, report the failed choice and obtain an explicit supported alternative, unless the
operator or project already authorized that alternative. Never silently substitute a model,
provider, effort, or access route. Pass the selected values through the existing native controls or
harness route; the helper's `--config` remains provider connection configuration, not this policy.

Optimize total time and usage to an accepted result, including coordination, repairs, and review.
Choose stronger reasoning early when a wrong approach risks substantial rework. Do not fragment
coherent work merely to use cheaper models, or assume maximum effort on one model outperforms
moderate effort on another. Keep progressing workers unchanged. Reassess the approach, assignment,
or model when attempts stop producing useful evidence; distinguish reasoning failures from slow
builds, transfers, devices, and other external delays.

Use existing batch notes for available model/effort, elapsed time, usage, repairs, and acceptance
outcomes. Leave unavailable measurements unknown. No new ledger, mandatory benchmark, automatic
retry ladder, or provider cascade is introduced. Independent review remains evidence-based even
when a stronger or different model performs it.
