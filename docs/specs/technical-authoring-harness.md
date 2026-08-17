---
id: spec.technical-authoring-harness
title: Technical Authoring Guidance
type: spec
status: current
owner: project-governance
created: 2026-02-16
updated: 2026-08-11
summary: Defines the generic boundary between documentation structure, editorial review, and source comments.
---

# Technical Authoring Guidance

The runtime may check documentation structure: frontmatter where a repository requires it, Markdown
shape, local links, and required project sections. Editorial quality remains a human or review-skill
responsibility unless an adopting repository deliberately adds a target pack.

Documentation ownership is simple:

| Concern | Owner |
| --- | --- |
| Generic document checking | Runtime wheel |
| Project terminology, required sections, audience, and examples | Adopting repository |
| Editorial judgement | Author and reviewer |
| Source-code comments and API documentation | Language-aware implementation checks |

The shared writing style is in [Writing Style Guide](../governance/writing-style-guide.md). It is
guidance, not a second execution framework.
