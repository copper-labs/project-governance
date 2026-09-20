# Project Harness

The continuity module of Project Governance. It preserves task intent, resumes work with bounded
context, and keeps evidence tied to the inputs that produced it. Governance is required; Codex app
is the first supported-host target. Cowork is deferred.

The host edits and reasons. Governance selects and runs checks. Harness records continuity and
links the results. Core operation needs no model calls.

- [Development flow: now, first release and destination](docs/architecture/development-flow.md)
- [Bundled installation contract](docs/specs/installation.md)
- [How to use it](HOW-TO-USE.md)
- [Implementation and review receipt](docs/reviews/2026-09-19-implementation-reconciliation.md)
- [Architecture and specifications](docs/specs/README.md)
- [Roadmap](docs/exec-plans/README.md)
- [Greenfield assessment](docs/reviews/2026-09-19-greenfield-assessment.md)

Node 22.18 or newer. Native TypeScript and SQLite. No runtime dependencies or build step.
Run `npm test` and `npm run typecheck` here. This is an early local implementation; real host
qualification and demonstrated token savings remain pilot work.

The governance wheel now embeds this runtime and exposes `project-governance harness` and `harness`.
Telemetry retention, full development-loop integration and native Codex hook qualification remain
adoption work. The module CLI is also available for source development.
