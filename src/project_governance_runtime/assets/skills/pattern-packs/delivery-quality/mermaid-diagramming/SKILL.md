---
name: mermaid-diagramming
description: Use when creating or reviewing Mermaid diagrams for architecture, sequence flows, state machines, entity relationships, user journeys, or comparison/radar views in governed docs.
---

# Mermaid Diagramming

## Trigger

Use this skill when docs need a diagram to explain flow, structure, lifecycle, ownership, relationships, state transitions, or tradeoffs.

## Required Reads

- `AGENTS.md`
- target docs style guide and markdown rules
- source artifact being diagrammed
- Mermaid support constraints for the target renderer

## Workflow

1. Pick the simplest diagram type that answers the reader's question.
2. Use sequence diagrams for interaction order, state diagrams for lifecycle, flowcharts for ownership or process, ER diagrams for data relationships, journeys for user experience, and radar/quadrant views only when comparison is the point.
3. Keep labels short, literal, and consistent with canonical terminology.
4. Avoid using diagrams as decoration. Every diagram must carry information that prose alone makes harder to scan.
5. Add a short lead-in sentence and enough surrounding prose for the diagram to be useful when rendered or read as source.
6. Validate the Mermaid syntax in the target renderer when possible.

## Validation

Run docs-governance and rendered Markdown checks where configured. If the target renderer differs from GitHub, verify the diagram there before release.

## Evidence

Report diagram type, purpose, source artifact, syntax/render validation, and any renderer limitations.
