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

The single governance installation/release, telemetry retention and development-loop integration are
accepted design, not delivered packaging. The existing CLI remains a local development surface.
