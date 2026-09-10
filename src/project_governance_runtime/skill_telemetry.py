"""Content-free Test Execution observations in the existing bounded local stream."""

import uuid

from . import __version__


EVENTS = {"skill-decision", "test-batch-terminal"}
CHOICES = {"direct", "reuse", "external", "attended", "bounded-fallback"}
HOSTS = {"codex", "claude", "unknown"}
REASONS = {"quick-check", "existing-proof", "long-batch", "independent-work", "attended", "unsupported-host", "unsafe-prerequisite"}
OUTCOMES = {"succeeded", "failed", "blocked", "cancelled", "timed_out"}


def sanitize(event):
    """Allow only stable identities, fixed choices and nonnegative numeric observations."""
    from .telemetry import _integer, _number, _text

    try:
        identity = str(uuid.UUID(event.get("decision_id", "")))
    except (ValueError, TypeError, AttributeError):
        return None
    if event.get("host") not in HOSTS or event.get("skill") != "test-execution":
        return None
    result = {"decision_id": identity, "skill": "test-execution", "host": event["host"]}
    version = _text(event.get("runtime_version"))
    if version:
        result["runtime_version"] = version
    if event["event"] == "skill-decision":
        if event.get("choice") not in CHOICES or event.get("reason") not in REASONS:
            return None
        return {**result, "choice": event["choice"], "reason": event["reason"], "observation": "reported"}
    if event.get("outcome") not in OUTCOMES:
        return None
    result.update(outcome=event["outcome"], observation="runtime")
    elapsed = _number(event.get("duration_ms"))
    if elapsed is not None:
        result["duration_ms"] = elapsed
    if type(event.get("cleanup_confirmed")) is bool:
        result["cleanup_confirmed"] = event["cleanup_confirmed"]
    for key in ("input_tokens", "cached_input_tokens", "output_tokens"):
        value = _integer(event.get(key))
        if value is not None:
            result[key] = value
    if event.get("handoff") in {"succeeded", "failed", "blocked", "cancelled", "not-requested"}:
        result["handoff"] = event["handoff"]
    return result


def record_use(root, identity, choice, host="unknown", reason="quick-check"):
    """Report one batch decision; a missing observation is never a test failure."""
    from .telemetry import append

    return append(root, dict(event="skill-decision", decision_id=identity, skill="test-execution",
                             runtime_version=__version__, host=host, choice=choice, reason=reason))


def record_terminal(root, identity, host, outcome, duration_ms, cleanup_confirmed, **usage):
    """Observe already-produced aggregate results without reading provider transcripts."""
    from .telemetry import append

    return append(root, dict(event="test-batch-terminal", decision_id=identity, skill="test-execution",
                             runtime_version=__version__, host=host, outcome=outcome, duration_ms=duration_ms,
                             cleanup_confirmed=cleanup_confirmed, **usage))


def summary(records):
    """Count unique retained observations and expose their incomplete coverage."""
    unique = {(r["event"], r["decision_id"]): r for r in records if r.get("event") in EVENTS}
    decisions = [r for (event, _), r in unique.items() if event == "skill-decision"]
    results = [r for (event, _), r in unique.items() if event == "test-batch-terminal"]
    def counts(items, field):
        return {value: sum(r.get(field) == value for r in items) for value in sorted({r[field] for r in items})}
    stamps = sorted(r["recorded_at"] for r in unique.values() if r.get("recorded_at"))
    usage = {}
    for key in ("input_tokens", "cached_input_tokens", "output_tokens"):
        observed = [r[key] for r in results if key in r]
        if observed:
            usage[key] = {"total": sum(observed), "observed_batches": len(observed)}
    return dict(reported_uses=len(decisions), by_host=counts(decisions, "host"), by_choice=counts(decisions, "choice"),
                observed_batches=len(results), outcomes=counts(results, "outcome"),
                duration_ms=sum(r.get("duration_ms", 0) for r in results), known_usage=usage,
                retained_since=stamps[0] if stamps else None, retained_until=stamps[-1] if stamps else None,
                limitations="Reported decisions are not proof of skill reading. Unreported use, missing measurements and aged-out events are unknown. Counts do not establish token savings.")
