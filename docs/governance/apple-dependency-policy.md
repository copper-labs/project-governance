---
id: governance.apple-dependency-policy
title: Apple Dependency Policy
type: governance
status: current
owner: project-governance
created: 2026-07-16
updated: 2026-09-21
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

SwiftPM-only implementation plans do not require a CocoaPods exception. The planning approval
gate applies to CocoaPods terms (`CocoaPods`, `Podfile`, and `.podspec`), including plans that
mention both package managers. CocoaPods approval must remain current and bound to the work item.

The check caller supplies that identity through `GOVERNANCE_WORK_ID`. The engine captures it before
dispatch and preserves it in the detached check request. Built-in approval validation receives the
same value; custom checker commands receive it through their explicit environment. Do not infer it
from an approval record or substitute an optional decision/JEV task ID. Missing, mismatched or
expired approval still fails. This transport repair is unreleased; installed RC3 does not preserve
the identity through this path.
