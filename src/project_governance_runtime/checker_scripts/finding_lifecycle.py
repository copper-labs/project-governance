"""Aggregate the shared finding lifecycle without changing finding records."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


FINDING_STATES = ("blocking", "advisory", "accepted", "waived", "suppressed")


def finding_summary(findings: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Return lifecycle counts and the envelope status implied by active findings."""
    counts = {
        state: sum(item.get("severity") == state for item in findings)
        for state in FINDING_STATES
    }
    status = "failed" if counts["blocking"] else (
        "warning" if counts["advisory"] else "passed"
    )
    return {
        "status": status,
        "finding_count": len(findings),
        "finding_counts": counts,
    }
