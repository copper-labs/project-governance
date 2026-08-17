"""Coordinate dependency-freshness CLI inputs, candidate evaluation, and reports."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from governance_changed_paths import changed_paths, packet_records

from dependency_primitives import (
    UnsupportedDependencyFormat,
    is_governed,
    load_yaml,
    normalized_path,
    parse_moment,
)
from dependency_evidence import (
    coordinate_set,
    finding,
    index_evidence,
    index_overrides,
    validate_policy,
)
from dependency_extractors import extract_npm_dependencies

def parse_args() -> argparse.Namespace:
    """Parse dependency selection, policy, evidence, and evaluation-time inputs."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--changed", action="store_true")
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--overrides", type=Path, required=True)
    parser.add_argument("--as-of", help="ISO date or timestamp used to evaluate override expiry")
    return parser.parse_args()
def load_policy(args: argparse.Namespace) -> tuple[int, int, list[dict[str, str]]]:
    """Load policy limits and normalize configuration failures."""
    findings: list[dict[str, str]] = []
    try:
        policy = load_yaml(args.policy)
    except ValueError as exc:
        policy = {}
        findings.append(finding("dependency.policy-invalid", args.policy.as_posix(), str(exc)))
    minimum, maximum, policy_findings = validate_policy(policy, args.policy, args.evidence)
    return minimum, maximum, [*findings, *policy_findings]
def evaluation_time(value: str | None) -> tuple[datetime, list[dict[str, str]]]:
    """Resolve an explicit or current evaluation time without raising."""
    try:
        return parse_moment(value or datetime.now(timezone.utc), "--as-of"), []
    except ValueError as exc:
        current = datetime.now(timezone.utc)
        return current, [finding("dependency.invocation-invalid", "<arguments>", str(exc))]
def profile_findings(path: Path | None) -> list[dict[str, str]]:
    """Validate an optional profile document supplied by a target."""
    if path is None:
        return []
    try:
        load_yaml(path)
        return []
    except ValueError as exc:
        return [finding("dependency.profile-invalid", path.as_posix(), str(exc))]
Coordinate = tuple[str, str, str, str]
NPM_MANIFEST_FIELDS = {
    "direct": {"dependencies"},
    "development": {"devDependencies"},
    "optional": {"optionalDependencies"},
    "peer": {"peerDependencies"},
    "override": {"overrides", "resolutions", "pnpm.overrides"},
    "toolchain": {"packageManager"},
}


def load_evidence_index(
    path: Path,
    minimum_age: int,
    as_of: datetime,
    relevant_coordinates: set[Coordinate],
) -> tuple[dict[Coordinate, dict[str, Any]], set[Coordinate], list[dict[str, str]]]:
    """Load optional target evidence and validate only changed-coordinate records."""
    if not path.exists():
        return {}, set(), []
    try:
        indexed, matched, errors = index_evidence(
            load_yaml(path), minimum_age, as_of, relevant_coordinates
        )
    except ValueError as exc:
        return {}, set(), [finding("dependency.evidence-invalid", path.as_posix(), str(exc))]
    return indexed, matched, [
        finding("dependency.evidence-invalid", path.as_posix(), error) for error in errors
    ]


def load_override_index(
    path: Path,
    maximum_days: int,
    as_of: datetime,
    relevant_coordinates: set[Coordinate],
) -> tuple[dict[Coordinate, dict[str, Any]], set[Coordinate], list[dict[str, str]]]:
    """Load optional overrides and validate only changed-coordinate records."""
    if not path.exists():
        return {}, set(), []
    try:
        indexed, matched, errors = index_overrides(
            load_yaml(path), maximum_days, as_of, relevant_coordinates
        )
    except ValueError as exc:
        return {}, set(), [finding("dependency.override-invalid", path.as_posix(), str(exc))]
    return indexed, matched, [
        finding("dependency.override-invalid", path.as_posix(), error) for error in errors
    ]
def candidate_records(args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Resolve exact before/after byte records from the runtime change packet."""
    try:
        mode = "all" if args.all else "staged" if args.staged else "changed"
        if args.path:
            paths = sorted(set(normalized_path(path) for path in args.path))
            unsupported = [finding("dependency.unsupported-format", path, "path is outside the active deterministic parser set; add a deterministic parser before explicit enforcement") for path in paths if not is_governed(path)]
            governed_paths = {path for path in paths if is_governed(path)}
            if not governed_paths:
                return [], unsupported
            if mode == "all":
                records = [
                    {"status": "added", "path": path, "before_path": None, "after_path": str(Path(path))}
                    for path in paths if path in governed_paths
                ]
                return records, unsupported
            records = [record for record in packet_records(mode) if record["path"] in governed_paths]
            missing = sorted(governed_paths - {str(record["path"]) for record in records})
            if missing:
                return [], [finding(
                    "dependency.unresolved-subject",
                    "<change-scope>",
                    f"change packet does not contain explicit paths: {missing}",
                )]
            return records, unsupported
        if mode == "all":
            return [
                {"status": "added", "path": path, "before_path": None, "after_path": str(Path(path))}
                for path in changed_paths(mode) if is_governed(path)
            ], []
        return packet_records(mode), []
    except (RuntimeError, ValueError) as exc:
        return [], [finding("dependency.unresolved-subject", "<change-scope>", str(exc))]


def _extract_image(relative: str, raw_path: Any) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Parse one packet image with content-stable npm entry defects kept separate."""
    content_path = Path(str(raw_path))
    try:
        return extract_npm_dependencies(content_path, logical_path=relative)
    except (OSError, UnicodeError, UnsupportedDependencyFormat) as exc:
        raise UnsupportedDependencyFormat(str(exc).replace(content_path.as_posix(), relative)) from exc


def npm_repair_keys(relative: str, coordinate: Coordinate) -> set[tuple[str, ...]]:
    """Map one valid npm coordinate to every manifest or lock defect it can repair."""
    if coordinate[0] != "npm":
        return set()
    if relative.endswith("package.json"):
        return {
            ("manifest", field, coordinate[1])
            for field in NPM_MANIFEST_FIELDS.get(coordinate[3], set())
        }
    if relative.endswith("package-lock.json"):
        return {("lock", coordinate[1])}
    return set()


def resolve_candidate_changes(
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], set[Coordinate], list[dict[str, str]]]:
    """Compute exact before/after tuple changes before reading registry records."""
    changes: list[dict[str, Any]] = []
    relevant_coordinates: set[Coordinate] = set()
    findings: list[dict[str, str]] = []
    for record in sorted(candidates, key=lambda item: str(item.get("path", ""))):
        relative = str(record.get("path", ""))
        if not is_governed(relative):
            continue
        if record.get("status") == "deleted" or record.get("after_path") is None:
            changes.append({"path": relative, "after": [], "changed": set(), "removed": True})
            continue
        try:
            before, before_defects = ([], []) if record.get("before_path") is None else _extract_image(relative, record["before_path"])
            after, after_defects = _extract_image(relative, record["after_path"])
        except UnsupportedDependencyFormat as exc:
            findings.append(finding("dependency.unsupported-format", relative, f"{exc}; add a deterministic parser before this governed syntax can pass"))
            continue
        before_repair_keys = {tuple(item["repair_key"]) for item in before_defects}
        after_repair_keys = {tuple(item["repair_key"]) for item in after_defects}
        repaired = before_repair_keys - after_repair_keys
        changed = {
            coordinate for coordinate in coordinate_set(after) - coordinate_set(before)
            if not npm_repair_keys(relative, coordinate) & repaired
        }
        before_identities = {tuple(item["identity"]) for item in before_defects}
        for defect in after_defects:
            if tuple(defect["identity"]) not in before_identities:
                findings.append(finding("dependency.unsupported-format", relative, str(defect["message"])))
        relevant_coordinates.update(changed)
        changes.append({"path": relative, "after": after, "changed": changed, "removed": False})
    return changes, relevant_coordinates, findings


def evaluate_candidate_changes(
    changes: list[dict[str, Any]],
    evidence_index: dict[Coordinate, dict[str, Any]],
    evidence_matches: set[Coordinate],
    override_index: dict[Coordinate, dict[str, Any]],
    override_matches: set[Coordinate],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Reconcile changed tuples without reopening unrelated registry debt."""
    checked: list[dict[str, Any]] = []
    findings: list[dict[str, str]] = []
    uncovered: dict[Coordinate, str] = {}
    for change in changes:
        relative = str(change["path"])
        changed: set[Coordinate] = change["changed"]
        if change["removed"]:
            checked.append({"path": relative, "status": "removed", "changed_dependency_count": 0})
            continue
        evidence_coordinates = changed & set(evidence_index)
        override_coordinates = changed & set(override_index)
        matching_records = evidence_matches | override_matches
        missing = changed - matching_records
        for coordinate in sorted(missing):
            uncovered.setdefault(coordinate, relative)
        status = "no-coordinate-changes"
        if changed:
            status = (
                "evidence-missing" if missing
                else "evidence-invalid" if changed - evidence_coordinates - override_coordinates
                else "operator-override" if override_coordinates and not evidence_coordinates
                else "evidence-verified"
            )
        checked.append({
            "path": relative,
            "status": status,
            "dependency_count": len(change["after"]),
            "changed_dependency_count": len(changed),
            "changed_dependencies": [
                {"ecosystem": item[0], "name": item[1], "version": item[2], "artifact_type": item[3]}
                for item in sorted(changed)
            ],
        })
    for coordinate, relative in uncovered.items():
        findings.append(finding(
            "dependency.evidence-missing",
            relative,
            f"introduced or updated dependency coordinate lacks exact freshness evidence or override: {coordinate}",
        ))
    return checked, findings
def emit_result(minimum_age: int, as_of: datetime, checked: list[dict[str, Any]], findings: list[dict[str, str]]) -> int:
    """Emit the stable dependency result and its process status."""
    report = {
        "version": 1,
        "check": "dependency-freshness",
        "status": "failed" if findings else "passed",
        "minimum_age_days": minimum_age,
        "evaluated_at": as_of.isoformat().replace("+00:00", "Z"),
        "checked": checked,
        "finding_count": len(findings),
        "findings": findings,
    }
    print(json.dumps(report, indent=2))
    return 1 if findings else 0
def main() -> int:
    """Coordinate dependency proof loading, evaluation, and reporting."""
    args = parse_args()

    minimum_age, override_max_days, findings = load_policy(args)
    as_of, time_findings = evaluation_time(args.as_of)
    candidates, discovery_findings = candidate_records(args)
    changes, relevant_coordinates, candidate_findings = resolve_candidate_changes(candidates)
    evidence_index, evidence_matches, evidence_findings = load_evidence_index(
        args.evidence, minimum_age, as_of, relevant_coordinates
    )
    override_index, override_matches, override_findings = load_override_index(
        args.overrides, override_max_days, as_of, relevant_coordinates
    )
    checked, reconciliation_findings = evaluate_candidate_changes(
        changes,
        evidence_index,
        evidence_matches,
        override_index,
        override_matches,
    )
    findings.extend([
        *time_findings, *profile_findings(args.profile), *evidence_findings,
        *override_findings, *discovery_findings, *candidate_findings,
        *reconciliation_findings,
    ])
    return emit_result(minimum_age, as_of, checked, findings)
