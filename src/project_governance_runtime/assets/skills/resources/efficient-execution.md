# Supervise Long-Running Commands

Portable guidance from the source validation strategy's Long-Running Command Supervision policy.
Use it when a planned command needs sustained supervision. Existing Plan and Work guidance owns
test selection, batching, valid evidence reuse, and complete diagnostic inventory before repair.
Follow the execution owner's dependency and failure rules; this resource adds no runner or gate.
For delegated jobs, also follow
`.governance/runtime/skills/resources/harness-agent-operation.md` for job IDs, cursors, and limits.

## Plan Once

Within the existing proof budget, identify the canonical command and prerequisites, wait strategy,
estimated duration if known, explicit deadline if any, and evidence location. Reference the owning
runbook where possible. Do this for long-running proof, not as new fields or per-step bookkeeping.
An estimate is not a deadline. Keep the existing input-invalidation and retry conditions.

## Wait And Recover

- Prefer completion-aware waits. Request 60 seconds for long commands where supported; otherwise
  use the longest wait compatible with the tool and higher-priority host instructions. Honor an
  applicable host preference for longer event-driven waits. Shorter waits require actionable input
  or a concrete intervention need. Send required progress updates without extra status investigations.
- Retain the owning process handle for each active invocation and wait on it. Empty buffered logs
  and wait expiry are not process failure; neither justifies duplicating, restarting, or killing
  work. Respect enforced deadlines and explicit cancellation. Read terminal status before claiming
  completion or failure.
- Continue authorized work or wait in the same working turn. Tests remaining active alone are not
  a reason to end it. When a host interruption or user/authority boundary prevents continuation,
  preserve the handle, command/workspace identity, evidence path, and next action in the existing
  handoff when possible. Recovery must verify identity and handle validity; handles may not survive
  host restarts. A lost handle does not prove exit. Resolve status before rerunning; if that is
  impossible, report the uncertainty rather than launch an unexplained duplicate.

## Keep Output Useful

Keep permitted full logs and machine receipts in existing target-owned artifacts under applicable
redaction and retention rules. Return changed phase, terminal status, actionable failures, and
evidence references. Aim for about 1,000 tokens per routine tool response where the host supports
output limits. This is a soft target, not a runtime limit; never hide failures to meet it.

For governance checks, use `--summary --json-output <evidence-path>` to keep the complete receipt
while returning the existing compact projection. Other runners keep their own logging interfaces.
Disclose omitted or truncated detail and where to read it. Read the complete finding inventory
before choosing repairs; a summary or single excerpt may omit separate causes. Expand targeted
excerpts when diagnosis requires it. Do not repeatedly replay unchanged logs or evidence.

Diagnose before retrying. Preserve the failed attempt and record a short reason in existing
evidence: changed source, repaired environment, corrected harness, or a named diagnostic experiment.
Follow Work's evidence-invalidation rules; takeover, compaction, and elapsed time alone do not
invalidate proof, but actual expiry and changed relevant inputs do.

At the existing batch review, inspect available execution records for unjustified short polls,
duplicate runs, premature turn endings, and repeated output. Leave missing observations unknown.
Do not add a per-batch audit log, skip required gates, or claim measured savings from this guidance.
