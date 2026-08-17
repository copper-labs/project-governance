---
id: governance.apple-dependency-policy
title: Apple Dependency Policy
type: governance
status: current
owner: project-governance
created: 2026-07-16
updated: 2026-08-11
summary: Default Swift Package Manager preference for repositories that opt into Apple dependency validation.
---

# Apple Dependency Policy

Repositories using Apple platforms should prefer Swift Package Manager for new dependencies and
distribution surfaces. CocoaPods remains possible when a repository documents an actual
compatibility, upstream, contractual, or time-bound migration constraint.

The generic Apple-dependency pack identifies relevant dependency surfaces. The adopting repository
decides its policy posture and owns any exception rationale, affected products, validation, and
eventual removal decision. The package runtime does not infer that decision or store customer
details.
