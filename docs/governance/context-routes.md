---
id: governance.context-routes
title: Context Route Guidance
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-11
summary: Explains how a repository maintains its own deterministic context routes.
---

# Context Route Guidance

This file describes the shape of repository-owned routing; it is not a global route table.

Each route should state:

- a stable route identifier;
- path and task selectors;
- the minimum required documents and skills;
- optional sources only when a condition is met; and
- one focused fixture showing a match or an intentional miss.

Avoid catch-all routes. A path that does not match must produce a clear route-miss result so the
repository can add a deliberate owner rather than loading unrelated context.
