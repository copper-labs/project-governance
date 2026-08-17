"""Validate governed CocoaPods exceptions independently from dependency discovery.

Exception records are intentionally evaluated after schema validation so one current approval can
authorize both changed CocoaPods surfaces and the related implementation plan.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from apple_dependency_discovery import matches


ALLOWED_REASONS = {
    "backward-compatibility",
    "upstream-has-no-usable-spm",
    "contract-or-regulatory",
    "migration-bridge",
    "emergency",
}
APPLE_PLANNING_TERMS = (
    "cocoapods",
    "podfile",
    ".podspec",
    "swiftpm",
    "swift package manager",
)


def valid_exception(path: str, work_id: str, exceptions: dict[str, Any]) -> tuple[bool, str]:
    """Validate the current work-bound exception for one changed CocoaPods path."""
    if not work_id:
        return False, "GOVERNANCE_WORK_ID is required to bind CocoaPods approval to the planned work"
    item = _matching_exception(path, exceptions)
    if item is None:
        return False, "no operator-approved CocoaPods exception matches this path"
    validation_error = _approval_error(item, work_id)
    if validation_error:
        return False, validation_error
    return True, "operator-approved exception"


def _matching_exception(path: str, exceptions: dict[str, Any]) -> dict[str, Any] | None:
    """Return the first exception whose declared scope includes one changed path."""
    for item in exceptions.get("exceptions", []):
        if isinstance(item, dict) and matches(
            path,
            [str(value) for value in item.get("path_globs", [])],
        ):
            return item
    return None


def _approval_error(item: dict[str, Any], work_id: str) -> str:
    """Return one stable reason why a path-matched approval cannot authorize work."""
    if not _has_approval_details(item):
        return "matching CocoaPods exception is not operator-approved with rationale"
    if item.get("reason") not in ALLOWED_REASONS:
        return "matching CocoaPods exception does not use an allowed reason"
    if item.get("work_id") != work_id:
        return "matching CocoaPods exception belongs to a different work item"
    expiry = _expiry(item)
    if expiry is None:
        return "matching CocoaPods exception has no valid expiry"
    if expiry < date.today():
        return "matching CocoaPods exception expired"
    return ""


def _has_approval_details(item: dict[str, Any]) -> bool:
    """Require the minimal operator evidence before considering an exception active."""
    return bool(
        item.get("status") == "approved"
        and item.get("operator")
        and item.get("approved_on")
        and item.get("rationale")
    )


def _expiry(item: dict[str, Any]) -> date | None:
    """Parse an exception expiry without allowing malformed records to escape the checker."""
    try:
        return date.fromisoformat(str(item.get("expires", "")))
    except ValueError:
        return None


def approved_planning_decision(path: str, work_id: str, exceptions: dict[str, Any]) -> bool:
    """Return whether a CocoaPods plan is backed by a current governed exception."""
    if not _mentions_apple_dependency(path):
        return True
    if not work_id:
        return False
    return any(_active_planning_exception(item, work_id) for item in exceptions.get("exceptions", []))


def _mentions_apple_dependency(path: str) -> bool:
    """Detect dependency planning terms in an existing plan file."""
    lowered = Path(path).read_text(encoding="utf-8", errors="replace").lower()
    return any(term in lowered for term in APPLE_PLANNING_TERMS)


def _active_planning_exception(item: object, work_id: str) -> bool:
    """Accept only a current, fully approved exception bound to the active work item."""
    if not isinstance(item, dict) or item.get("work_id") != work_id:
        return False
    if not _has_approval_details(item) or item.get("reason") not in ALLOWED_REASONS:
        return False
    expiry = _expiry(item)
    return expiry is not None and expiry >= date.today()
