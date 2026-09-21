# Deterministic execution in the compiled runtime

Read the selected runtime's `test-execution/SKILL.md` through `skill-read` before choosing a durable
check or workflow. The project owns commands, prerequisites, assertions, devices and toolchains.
The engine owns durable dispatch, resource coordination, observation and result receipts.

Use detached checks for governed pack execution and authorized workflow recipes for build/device
operations. Preserve the returned run identity and task/action authority. Submission replay must
attach to the same operation; changed input is not permission to reuse stale evidence. Never launch
another run solely because observation expired or a completion notice was duplicated.

Observe terminal results and confirmed cleanup before acceptance. Unknown cleanup retains ownership;
cancellation is a request, not permission to release resources or terminate unrelated processes.
Assess every failed, blocked or not-run stage. Source tests, simulator tests and physical-device
proof establish different claims. Provider completion delivery does not turn a workflow into a pass.

Use the provider-help guide only for authorized model assignments. The old wheel batch command is
not an alternate execution authority for a compiled installation.
