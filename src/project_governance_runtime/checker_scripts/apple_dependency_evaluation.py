"""Compose Apple dependency discovery, exception validation, and report generation.

The public checker keeps argument parsing at the command boundary while this module coordinates
the small policy decisions that make its JSON report deterministic and maintainable.
"""

from __future__ import annotations

import argparse
import fnmatch
from pathlib import Path
from typing import Any

import yaml

from apple_dependency_discovery import all_files, is_cocoapods_surface, is_swiftpm_surface
from apple_dependency_exceptions import (
    APPLE_PLANNING_TERMS,
    approved_planning_decision,
    valid_exception,
)
from governance_changed_paths import changed_paths
from governance_schema import validate_document


def evaluate(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    """Evaluate one parsed invocation and return its exit code plus evidence envelope."""
    policy = load_yaml(args.policy, {"applies": "auto", "default": "swiftpm"})
    invalid_policy = policy_invalid_report(policy, args.policy)
    if invalid_policy is not None:
        return 1, invalid_policy
    changed = selected_paths(args)
    discovery = discover(changed)
    if not discovery.apple_detected and policy.get("applies", "auto") == "auto":
        return 0, not_applicable_report()
    findings = exception_schema_findings(args)
    findings.extend(planning_findings(discovery.plan_changed, args.work_id, args.exceptions))
    findings.extend(cocoapods_findings(discovery.coco_changed, args.work_id, args.exceptions))
    if args.all and discovery.coco_all:
        findings.append(existing_cocoapods_finding(discovery.coco_all[0]))
    return report(args.stage, discovery, findings)


class Discovery:
    """Keep one invocation's classified paths together for policy evaluation and reporting."""

    def __init__(
        self,
        coco_all: list[str],
        spm_all: list[str],
        coco_changed: list[str],
        plan_changed: list[str],
        apple_detected: bool,
    ) -> None:
        """Record deterministic discovery results without making policy decisions."""
        self.coco_all = coco_all
        self.spm_all = spm_all
        self.coco_changed = coco_changed
        self.plan_changed = plan_changed
        self.apple_detected = apple_detected


def load_yaml(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    """Load one policy document or return its explicit missing-file default."""
    if not path.exists():
        return fallback
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else fallback


def selected_paths(args: argparse.Namespace) -> list[str]:
    """Use explicit paths first, then select staged, changed, or exhaustive scope."""
    if args.path:
        return list(args.path)
    if args.all:
        return []
    return changed_paths("changed" if args.changed else "staged")


def discover(changed: list[str]) -> Discovery:
    """Classify changed and repository-wide Apple dependency surfaces."""
    discovered = all_files()
    coco_all = sorted(path for path in discovered if is_cocoapods_surface(path))
    spm_all = sorted(path for path in discovered if is_swiftpm_surface(path))
    coco_changed = sorted(path for path in changed if is_cocoapods_surface(path))
    plan_changed = sorted(path for path in changed if _is_plan_path(path))
    planned_apple = any(_plan_mentions_apple(path) for path in plan_changed)
    apple_detected = bool(
        coco_all
        or coco_changed
        or spm_all
        or planned_apple
        or any(path.endswith((".swift", ".xcodeproj/project.pbxproj")) for path in discovered)
    )
    return Discovery(coco_all, spm_all, coco_changed, plan_changed, apple_detected)


def _is_plan_path(path: str) -> bool:
    """Limit planning approval enforcement to governed execution-plan Markdown paths."""
    return fnmatch.fnmatch(path, "docs/exec-plans/**/*.md") or fnmatch.fnmatch(
        path,
        "docs/exec-plans/*.md",
    )


def _plan_mentions_apple(path: str) -> bool:
    """Detect Apple dependency terms only when a changed plan still exists locally."""
    candidate = Path(path)
    if not candidate.is_file():
        return False
    lowered = candidate.read_text(encoding="utf-8", errors="replace").lower()
    return any(term in lowered for term in APPLE_PLANNING_TERMS)


def policy_invalid_report(policy: dict[str, Any], path: Path) -> dict[str, Any] | None:
    """Reject disabled or malformed applicability policies before discovery begins."""
    if policy.get("applies") in {"auto", "always"}:
        return None
    finding = {
        "rule_id": "apple.policy-invalid",
        "path": path.as_posix(),
        "severity": "blocking",
        "message": "Apple dependency policy applies must be auto or always; company policy cannot be disabled in a project profile.",
    }
    return failed_report([finding])


def exception_schema_findings(args: argparse.Namespace) -> list[dict[str, Any]]:
    """Validate exceptions with the caller-selected schema before applying approvals."""
    exceptions = load_yaml(args.exceptions, {"exceptions": []})
    return [
        {
            "rule_id": "apple.exception-schema",
            "path": args.exceptions.as_posix(),
            "severity": "blocking",
            "message": error,
        }
        for error in validate_document(
            exceptions,
            args.exceptions_schema,
            args.exceptions.as_posix(),
        )
    ]


def _exceptions(path: Path) -> dict[str, Any]:
    """Load exceptions afresh so every policy decision preserves prior file-read behavior."""
    return load_yaml(path, {"exceptions": []})


def planning_findings(
    plan_paths: list[str],
    work_id: str,
    exceptions_path: Path,
) -> list[dict[str, Any]]:
    """Require an approval when an existing changed plan discusses CocoaPods."""
    exceptions = _exceptions(exceptions_path)
    return [
        {
            "rule_id": "apple.cocoapods-planning-approval",
            "path": path,
            "severity": "blocking",
            "message": "This plan discusses CocoaPods without a recorded operator approval. Alert the operator in planning before dependency writes.",
        }
        for path in plan_paths
        if Path(path).is_file() and not approved_planning_decision(path, work_id, exceptions)
    ]


def cocoapods_findings(
    paths: list[str],
    work_id: str,
    exceptions_path: Path,
) -> list[dict[str, Any]]:
    """Require a current work-bound exception for every changed CocoaPods surface."""
    exceptions = _exceptions(exceptions_path)
    findings: list[dict[str, Any]] = []
    for path in paths:
        valid, reason = valid_exception(path, work_id, exceptions)
        if not valid:
            findings.append(
                {
                    "rule_id": "apple.cocoapods-exception-required",
                    "path": path,
                    "severity": "blocking",
                    "message": f"CocoaPods is an exception to company SPM-first policy: {reason}. Alert the operator during planning and obtain approval before writes.",
                }
            )
    return findings


def existing_cocoapods_finding(path: str) -> dict[str, str]:
    """Report baseline CocoaPods use as advisory during an exhaustive audit."""
    return {
        "rule_id": "apple.existing-cocoapods",
        "path": path,
        "severity": "advisory",
        "message": "Existing CocoaPods use was detected. Do not expand or remove it without a compatibility decision in the plan.",
    }


def not_applicable_report() -> dict[str, Any]:
    """Emit the stable no-Apple-project envelope without unrelated policy noise."""
    return {
        "version": 1,
        "check": "apple-dependency-policy",
        "status": "not-applicable",
        "finding_count": 0,
        "discovery": {"swiftpm": [], "cocoapods": []},
        "findings": [],
    }


def failed_report(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """Emit the early invalid-policy envelope without a discovery claim."""
    return {
        "version": 1,
        "check": "apple-dependency-policy",
        "status": "failed",
        "finding_count": len(findings),
        "findings": findings,
    }


def report(
    stage: str,
    discovery: Discovery,
    findings: list[dict[str, Any]],
) -> tuple[int, dict[str, Any]]:
    """Build the standard evidence envelope and its blocking exit code."""
    blocking = [item for item in findings if item["severity"] == "blocking"]
    status = "failed" if blocking else "warning" if findings else "passed"
    return (1 if blocking else 0), {
        "version": 1,
        "check": "apple-dependency-policy",
        "status": status,
        "finding_count": len(findings),
        "stage": stage,
        "policy": "swiftpm-first",
        "discovery": {"swiftpm": discovery.spm_all, "cocoapods": discovery.coco_all},
        "findings": findings,
    }
