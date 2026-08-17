#!/usr/bin/env python3
"""Responsibility: Run the governed source-comment policy and emit normalized evidence.

Context: The comment-quality validation pack calls this entrypoint for staged, changed, explicit,
or full scans while language-specific analysis remains isolated in source_comment_analysis.py.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import yaml

from comment_checker_registry import apply_waivers, registry_findings
from comment_checker_selection import selection_file, selection_records, selected_paths, self_test_selection
from finding_lifecycle import finding_summary
from source_comment_analysis import (
    SOURCE_FAMILIES,
    adapter_findings,
    add,
    downgrade_to_advisory,
    fixture_proof,
    generic_findings,
)


DEFAULT_POLICY = Path("config/policies/source-comments.yaml")
DEFAULT_POLICY_SCHEMA = Path("schema/source-comments.schema.json")
DEFAULT_WAIVERS = Path("config/policies/source-comment-waivers.yaml")
DEFAULT_ADAPTERS = Path("config/policies/source-comment-adapters.yaml")


def load_yaml(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    """Load one YAML mapping or return the caller's fail-closed fallback."""
    if not path.exists():
        return fallback
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else fallback


def parse_arguments() -> argparse.Namespace:
    """Parse the comment checker command surface without executing policy behavior."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--changed", action="store_true")
    mode.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    parser.add_argument("--waivers", type=Path, default=DEFAULT_WAIVERS)
    parser.add_argument("--adapters", type=Path, default=DEFAULT_ADAPTERS)
    parser.add_argument("--policy-schema", type=Path, default=DEFAULT_POLICY_SCHEMA)
    parser.add_argument(
        "--adapters-schema",
        type=Path,
        default=Path("schema/source-comment-adapters.schema.json"),
    )
    parser.add_argument(
        "--waivers-schema",
        type=Path,
        default=Path("schema/source-comment-waivers.schema.json"),
    )
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--governance-selection-only", action="store_true")
    parser.add_argument("--governance-selection-file", type=Path)
    return parser.parse_args()


def emit_self_test_selection() -> int:
    """Emit the fixture inputs required by a selection-only conformance replay."""
    print(json.dumps({
            "version": 1,
            "check": "comment-quality-selection",
            "status": "passed",
            "finding_count": 0,
            "findings": [],
            "selected_inputs": self_test_selection(),
        }, indent=2))
    return 0


def emit_self_test(findings: list[dict[str, Any]], adapters: dict[str, dict[str, Any]], policy: dict[str, Any]) -> int:
    """Run adapter fixture proof and return its normalized process status."""
    proof_findings, proof_coverage = fixture_proof(adapters, policy)
    findings.extend(proof_findings)
    summary = finding_summary(findings)
    payload = {
        "version": 1,
        "check": "comment-quality-self-test",
        **summary,
        "coverage": proof_coverage,
        "findings": findings,
    }
    print(json.dumps(payload, indent=2))
    return 1 if summary["status"] == "failed" else 0


def resolve_selections(
    args: argparse.Namespace, policy: dict[str, Any], findings: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], str]:
    """Load frozen inputs or calculate selections while surfacing selection failures as findings."""
    try:
        if args.governance_selection_file:
            return selection_file(args.governance_selection_file)
        return selected_paths(args, policy)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as exc:
        add(findings, "SC010", Path("."), 1, str(exc))
        return [], "failed"


def emit_selection_result(findings: list[dict[str, Any]], selections: list[dict[str, Any]], selected_mode: str) -> int:
    """Emit governed selection evidence, including CI fixture inputs when requested."""
    if selected_mode == "failed":
        payload = {
            "version": 1,
            "check": "comment-quality-selection",
            "mode": "failed",
            "status": "failed",
            "finding_count": len(findings),
            "findings": findings,
            "selected_inputs": [],
        }
        print(json.dumps(payload, indent=2))
        return 1
    records = selection_records(selections)
    if os.environ.get("GOVERNANCE_STAGE") == "ci-pr":
        records.extend(self_test_selection())
    print(json.dumps({
            "version": 1,
            "check": "comment-quality-selection",
            "mode": selected_mode,
            "status": "passed",
            "finding_count": 0,
            "findings": [],
            "selected_inputs": records,
        }, indent=2))
    return 0


def analyze_selections(
    selections: list[dict[str, Any]],
    adapters: dict[str, dict[str, Any]],
    policy: dict[str, Any],
    findings: list[dict[str, Any]],
) -> dict[str, int]:
    """Apply active or advisory adapter analysis to the governed source selections."""
    coverage: dict[str, int] = {}
    for selection in selections:
        analyze_selection(selection, adapters, policy, findings, coverage)
    return coverage


def analyze_selection(
    selection: dict[str, Any],
    adapters: dict[str, dict[str, Any]],
    policy: dict[str, Any],
    findings: list[dict[str, Any]],
    coverage: dict[str, int],
) -> None:
    """Add source findings for one selected path and increment its language coverage."""
    path = selection["path"]
    family = SOURCE_FAMILIES[path.suffix.lower()]
    coverage[family] = coverage.get(family, 0) + 1
    text = selection.get("source_path", path).read_text(encoding="utf-8", errors="replace")
    adapter = adapters.get(family, {})
    status = adapter.get("status", "unknown")
    if status != "active":
        add(findings, "SC001", path, 1, f"The {family} comment adapter is {status}; native or parser-backed coverage is not active.", "advisory")
        if policy.get("unsupported_languages") == "advisory":
            fallback_findings = generic_findings(path, text, policy, family)
            downgrade_to_advisory(fallback_findings)
            findings.extend(fallback_findings)
        return
    source_findings = adapter_findings(family, adapter, path, text, policy, selection)
    if selection.get("advisory_only"):
        downgrade_to_advisory(source_findings)
    findings.extend(source_findings)


def result_payload(
    findings: list[dict[str, Any]],
    coverage: dict[str, int],
    proof_coverage: dict[str, Any] | None,
    policy: dict[str, Any],
    selected_mode: str,
    selections: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the stable result envelope consumed by the comment-quality validation pack."""
    summary = finding_summary(findings)
    return {
        "version": 1,
        "check": "comment-quality",
        **summary,
        "coverage": coverage,
        "self_test_coverage": proof_coverage,
        "selection": {
            "mode": selected_mode,
            "source_roots": list(policy.get("source_roots", [])),
            "test_scope": policy.get("test_scope"),
            "selected_path_count": len(selections),
        },
        "waived_finding_count": sum(item.get("severity") == "waived" for item in findings),
        "findings": findings,
    }


def main() -> int:
    """Run registry proof or source analysis for the selected governance mode."""
    args = parse_arguments()
    policy = load_yaml(args.policy, {})
    registry = load_yaml(args.adapters, {"adapters": []})
    waivers = load_yaml(args.waivers, {"waivers": []})
    if args.governance_selection_only and args.self_test:
        return emit_self_test_selection()
    findings, adapters = registry_findings(policy, registry, waivers, args)
    if args.self_test:
        return emit_self_test(findings, adapters, policy)
    selections, selected_mode = resolve_selections(args, policy, findings)
    if args.governance_selection_only:
        return emit_selection_result(findings, selections, selected_mode)
    proof_coverage: dict[str, Any] | None = None
    if os.environ.get("GOVERNANCE_STAGE") == "ci-pr":
        proof_findings, proof_coverage = fixture_proof(adapters, policy)
        findings.extend(proof_findings)
    coverage = analyze_selections(selections, adapters, policy, findings)
    apply_waivers(findings, waivers)
    payload = result_payload(
        findings, coverage, proof_coverage, policy, selected_mode, selections
    )
    print(json.dumps(payload, indent=2))
    return 1 if payload["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
