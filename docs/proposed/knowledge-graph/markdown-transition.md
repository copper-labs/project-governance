---
id: proposed.markdown-to-knowledge-graph-transition
title: Markdown To Knowledge-Graph Transition
type: spec
status: deferred
owner: project-governance
created: 2026-04-17
updated: 2026-08-11
summary: Deferred transition safeguards for any future change of governance authority.
---

# Markdown To Knowledge-Graph Transition

Markdown is the current and only governance authority. No transition is approved or active. There is
no runtime, adapter, migration, shadow mode, activation, release, implementation, or compatibility
path in this repository.

## Safeguards For Any Future Proposal

If a future knowledge-graph initiative is approved, it must define:

- the governed content in scope and its stable identity, provenance, review state, and history;
- a reconciliation process that identifies loss, conflict, and semantic differences before authority
  changes;
- an explicit decision point at which exactly one authority is selected;
- portable export, restore, and rollback evidence;
- retirement of superseded readers and writers rather than a permanent hybrid;
- operator-visible validation of content, relationships, access, recovery, and repository behavior.

The future plan must stand on its own. These safeguards preserve design lessons, not an executable
transition recipe.
