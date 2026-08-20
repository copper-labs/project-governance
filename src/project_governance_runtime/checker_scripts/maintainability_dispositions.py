#!/usr/bin/env python3
"""Own durable maintainability decisions, schema migration, and relocation integrity."""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from governance_changed_paths import packet_records
from governance_schema import validate_document


def fingerprint(path: Path) -> str:
    """Return the exact-source identity retained only for temporary waivers."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def disposition_for(
    rule_id: str,
    path: Path,
    symbol: str,
    actual: int,
    sha: str,
    config: dict[str, Any],
) -> tuple[bool, str]:
    """Apply one stable human decision keyed by finding, path, and qualified symbol."""
    item = next(
        (
            value
            for value in config.get("dispositions", [])
            if isinstance(value, dict)
            and value.get("finding") == rule_id
            and value.get("path") == path.as_posix()
            and value.get("symbol") == symbol
        ),
        None,
    )
    if item is None:
        return False, "architectural review is required"
    if item.get("disposition") == "cohesion-accepted":
        return True, "cohesion and readability accepted after explicit review"
    if item.get("disposition") == "temporary-waiver":
        return _temporary_waiver_status(item, actual, sha)
    if item.get("disposition") == "waiver-resolved":
        return False, "a prior waiver resolution does not authorize a current finding"
    if item.get("disposition") == "refactor-required":
        return False, "the recorded disposition requires refactoring"
    return False, "the matching disposition has an unknown value"


def _temporary_waiver_status(
    item: dict[str, Any], actual: int, sha: str
) -> tuple[bool, str]:
    """Require a time-boxed waiver to match the exact current source and metric."""
    try:
        expires = date.fromisoformat(str(item.get("expires", "")))
    except ValueError:
        return False, "temporary waiver has no valid expiry date"
    if item.get("current_value") != actual or item.get("source_fingerprint") != f"sha256:{sha}":
        return False, "temporary waiver is stale because the governed source changed"
    if len(str(item.get("remediation_plan", "")).strip()) < 40:
        return False, "temporary waiver has no meaningful remediation plan"
    active = expires >= date.today()
    return active, "temporary waiver is active" if active else "temporary waiver expired"


def _finding(
    rule_id: str,
    path: Path,
    symbol: str,
    actual: int,
    message: str,
) -> dict[str, Any]:
    """Build one configuration-level maintainability blocker."""
    return {
        "rule_id": rule_id,
        "path": path.as_posix(),
        "line": 1,
        "symbol": symbol,
        "actual": actual,
        "threshold": 0,
        "severity": "blocking",
        "message": message,
    }


def _migration_finding(
    config: dict[str, Any], disposition_path: Path
) -> dict[str, Any] | None:
    """Group all version-1 records into one fail-closed migration obligation."""
    if config.get("version") != 1:
        return None
    keys = sorted(
        f"{item.get('finding', '?')}|{item.get('path', '?')}|"
        f"{item.get('symbol', '?')}|{item.get('disposition', '?')}"
        for item in config.get("dispositions", [])
        if isinstance(item, dict)
    )
    return _finding(
        "quality.disposition-migration-required",
        disposition_path,
        "version-1",
        len(keys),
        "Version-1 dispositions cannot authorize a pass; migrate exact records: "
        + (", ".join(keys) if keys else "<none>"),
    )


def _identity_findings(
    config: dict[str, Any], disposition_path: Path
) -> list[dict[str, Any]]:
    """Reject ambiguous or nonnormalized stable decision keys once per document."""
    keys: list[str] = []
    invalid_paths: list[str] = []
    for item in config.get("dispositions", []):
        if not isinstance(item, dict):
            continue
        finding = item.get("finding")
        raw_path = item.get("path")
        symbol = item.get("symbol")
        if not all(isinstance(value, str) for value in (finding, raw_path, symbol)):
            continue
        path = Path(raw_path)
        if path.is_absolute() or ".." in path.parts or path.as_posix() != raw_path:
            invalid_paths.append(raw_path)
        keys.append(f"{finding}|{raw_path}|{symbol}")
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    details = [
        *(f"duplicate:{key}" for key in duplicates),
        *(f"nonnormalized:{path}" for path in sorted(set(invalid_paths))),
    ]
    if not details:
        return []
    return [_finding(
        "quality.disposition-identity",
        disposition_path,
        "stable-keys",
        len(details),
        "Disposition keys must be unique normalized repository identities: "
        + ", ".join(details),
    )]


def validated_config(
    config: dict[str, Any], schema_path: Path, disposition_path: Path
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Validate v2 once or fail v1 once without weakening any old disposition."""
    migration = _migration_finding(config, disposition_path)
    if migration is not None:
        return {"version": 2, "owner": "migration-required", "dispositions": []}, [migration]
    findings = [
        _finding(
            "quality.disposition-schema", disposition_path, disposition_path.name, 0, error
        )
        for error in validate_document(config, schema_path, disposition_path.as_posix())
    ]
    findings.extend(_identity_findings(config, disposition_path))
    return config, findings


def _active_relocation_records(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Return decisions whose loss could weaken an active blocker or waiver."""
    result: list[dict[str, Any]] = []
    for item in config.get("dispositions", []):
        if not isinstance(item, dict):
            continue
        if item.get("disposition") == "refactor-required":
            result.append(item)
            continue
        if item.get("disposition") != "temporary-waiver":
            continue
        try:
            if date.fromisoformat(str(item.get("expires", ""))) >= date.today():
                result.append(item)
        except ValueError:
            result.append(item)
    return result


def _stable_key(item: dict[str, Any]) -> tuple[str, str, str]:
    """Return the durable identity shared by decisions and current findings."""
    return (
        str(item.get("finding", "")),
        str(item.get("path", "")),
        str(item.get("symbol", "")),
    )


def _registry_repository_path(path: Path) -> str | None:
    """Map a target-owned registry to its normalized repository identity."""
    if not path.is_absolute():
        return path.as_posix()
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return None


def _prior_registry(
    packet: list[dict[str, Any]], disposition_path: Path
) -> tuple[dict[str, Any] | None, str]:
    """Read the packet's exact before-image when the decision registry changed."""
    repository_path = _registry_repository_path(disposition_path)
    if repository_path is None:
        return None, ""
    record = next(
        (
            item
            for item in packet
            if item["path"] == repository_path
            or item.get("previous_path") == repository_path
        ),
        None,
    )
    if record is None or record.get("before_path") is None:
        return None, ""
    try:
        value = yaml.safe_load(
            Path(record["before_path"]).read_text(encoding="utf-8")
        )
    except (OSError, yaml.YAMLError) as error:
        return None, str(error)
    if not isinstance(value, dict):
        return None, "prior disposition registry is not a mapping"
    return value, ""


def _renamed_paths(packet: list[dict[str, Any]]) -> dict[str, str]:
    """Return only explicit Git path moves from the immutable change packet."""
    return {
        str(record["previous_path"]): str(record["path"])
        for record in packet
        if record.get("previous_path")
    }


def _transition_candidates(
    old: dict[str, Any],
    current: dict[str, Any],
    renamed_paths: dict[str, str],
) -> list[dict[str, Any]]:
    """Find deliberate current records that could preserve or resolve one old record."""
    old_finding, old_path, old_symbol = _stable_key(old)
    expected_path = renamed_paths.get(old_path, old_path)
    responsibility = str(old.get("responsibility", ""))
    result: list[dict[str, Any]] = []
    for item in current.get("dispositions", []):
        if not isinstance(item, dict) or item.get("finding") != old_finding:
            continue
        same_identity = (
            item.get("path") == expected_path and item.get("symbol") == old_symbol
        )
        same_responsibility = bool(responsibility) and (
            item.get("responsibility") == responsibility
        )
        if same_identity or same_responsibility:
            result.append(item)
    return result


def _valid_temporary_waiver_transition(
    old: dict[str, Any], current: dict[str, Any]
) -> bool:
    """Preserve one exact waiver or accept one explicitly reviewed replacement."""
    new_disposition = current.get("disposition")
    old_value = old.get("current_value", old.get("current_lines"))
    unchanged = (
        new_disposition == "temporary-waiver"
        and current.get("current_value") == old_value
        and all(
            current.get(field) == old.get(field)
            for field in (
                "source_fingerprint",
                "supersedes_source_fingerprint",
                "expires",
                "remediation_plan",
            )
        )
    )
    if unchanged:
        return True
    try:
        reviewed_on = date.fromisoformat(str(current.get("approved_on", "")))
        prior_reviewed_on = date.fromisoformat(str(old.get("approved_on", "")))
    except ValueError:
        return False
    old_fingerprint = old.get("source_fingerprint")
    reviewed_replacement = (
        current.get("supersedes_source_fingerprint") == old_fingerprint
        and current.get("responsibility") == old.get("responsibility")
        and reviewed_on >= prior_reviewed_on
        and all(
            str(current.get(field, "")).strip()
            for field in ("reviewer", "approved_on", "rationale")
        )
    )
    return reviewed_replacement and (
        new_disposition == "waiver-resolved"
        or (
            new_disposition == "temporary-waiver"
            and current.get("source_fingerprint") != old_fingerprint
            and all(
                str(current.get(field, "")).strip()
                for field in ("expires", "remediation_plan")
            )
        )
    )


def _valid_transition(old: dict[str, Any], current: dict[str, Any]) -> bool:
    """Keep waivers exact and require a reviewed decision to resolve refactoring."""
    old_disposition = old.get("disposition")
    new_disposition = current.get("disposition")
    if old_disposition == "temporary-waiver":
        return _valid_temporary_waiver_transition(old, current)
    if old_disposition != "refactor-required":
        return True
    responsibility_preserved = not old.get("responsibility") or (
        current.get("responsibility") == old.get("responsibility")
    )
    if new_disposition == "refactor-required":
        return responsibility_preserved
    return (
        new_disposition == "cohesion-accepted"
        and responsibility_preserved
        and all(str(current.get(field, "")).strip() for field in (
            "reviewer", "approved_on", "rationale"
        ))
    )


def _transition_findings(
    prior: dict[str, Any] | None,
    current: dict[str, Any],
    packet: list[dict[str, Any]],
    disposition_path: Path,
    history_error: str,
    source_fingerprints: dict[str, str],
    observed_findings: set[tuple[Any, Any, Any]],
) -> list[dict[str, Any]]:
    """Prevent a registry edit from silently deleting or weakening active decisions."""
    if history_error:
        return [_finding(
            "quality.disposition-history-unreadable",
            disposition_path,
            "before-image",
            1,
            f"Cannot validate the previous disposition registry: {history_error}",
        )]
    if prior is None:
        return []
    invalid: list[str] = []
    renamed = _renamed_paths(packet)
    for old in _active_relocation_records(prior):
        candidates = _transition_candidates(old, current, renamed)
        candidate = candidates[0] if len(candidates) == 1 else {}
        source_required = candidate.get("disposition") == "waiver-resolved" or (
            candidate.get("disposition") == "temporary-waiver"
            and candidate.get("source_fingerprint") != old.get("source_fingerprint")
        )
        source_proven = not source_required or (
            str(candidate.get("path", "")) in source_fingerprints
        )
        resolution_proven = candidate.get("disposition") != "waiver-resolved" or (
            _stable_key(candidate) not in observed_findings
        )
        if (
            not candidate
            or not _valid_transition(old, candidate)
            or not source_proven
            or not resolution_proven
        ):
            invalid.append("|".join(_stable_key(old)))
    if not invalid:
        return []
    return [_finding(
        "quality.disposition-transition-required",
        disposition_path,
        "before-to-after",
        len(invalid),
        "Preserve or explicitly resolve prior active decisions: "
        + ", ".join(sorted(invalid)),
    )]


def _record_is_orphaned(
    item: dict[str, Any],
    removed_paths: set[str],
    symbols: dict[str, set[str]],
    mode: str,
) -> bool:
    """Identify one active decision whose governed path or symbol disappeared."""
    path = str(item.get("path", ""))
    symbol = str(item.get("symbol", ""))
    return (
        path in removed_paths
        or mode == "all" and not Path(path).exists()
        or path in symbols and symbol not in symbols[path]
    )


def _current_record_issues(
    records: list[dict[str, Any]],
    removed_paths: set[str],
    symbols: dict[str, set[str]],
    source_fingerprints: dict[str, str],
    observed_findings: set[tuple[Any, Any, Any]],
    mode: str,
) -> tuple[list[str], list[str], list[str]]:
    """Classify current relocation, refactoring, and temporary-waiver obligations."""
    orphaned_records = [
        item
        for item in records
        if _record_is_orphaned(item, removed_paths, symbols, mode)
    ]
    live_records = [item for item in records if item not in orphaned_records]
    unresolved = [
        "|".join(_stable_key(item))
        for item in live_records
        if item.get("disposition") == "refactor-required"
        and str(item.get("path", "")) in symbols
        and _stable_key(item) not in observed_findings
    ]
    invalid_waivers = [
        "|".join(_stable_key(item))
        for item in live_records
        if item.get("disposition") == "temporary-waiver"
        and str(item.get("path", "")) in source_fingerprints
        and _stable_key(item) not in observed_findings
    ]
    return (
        ["|".join(_stable_key(item)) for item in orphaned_records],
        unresolved,
        invalid_waivers,
    )


def integrity_findings(
    config: dict[str, Any],
    disposition_path: Path,
    mode: str,
    symbols: dict[str, set[str]],
    source_fingerprints: dict[str, str],
    observed_findings: set[tuple[Any, Any, Any]],
) -> list[dict[str, Any]]:
    """Prevent changed paths or symbols from orphaning an active blocking decision."""
    records = _active_relocation_records(config)
    packet = [] if mode in {"all", "explicit"} else packet_records(mode)
    prior, history_error = _prior_registry(packet, disposition_path)
    findings = _transition_findings(
        prior,
        config,
        packet,
        disposition_path,
        history_error,
        source_fingerprints,
        observed_findings,
    )
    removed_paths = {
        value
        for record in packet
        for value in (
            record["path"] if record["status"] == "deleted" else None,
            record.get("previous_path"),
        )
        if value
    }
    orphaned, unresolved, invalid_waivers = _current_record_issues(
        records,
        removed_paths,
        symbols,
        source_fingerprints,
        observed_findings,
        mode,
    )
    if orphaned:
        findings.append(_finding(
            "quality.disposition-relocation-required",
            disposition_path,
            "relocation",
            len(orphaned),
            "Move or supersede active disposition records: "
            + ", ".join(sorted(orphaned)),
        ))
    if unresolved:
        findings.append(_finding(
            "quality.refactor-required",
            disposition_path,
            "active-records",
            len(unresolved),
            "Reviewed responsibility findings remain unresolved: "
            + ", ".join(sorted(unresolved)),
        ))
    if invalid_waivers:
        findings.append(_finding(
            "quality.temporary-waiver-invalid",
            disposition_path,
            "active-records",
            len(invalid_waivers),
            "Temporary waivers changed, expired, or no longer match a finding: "
            + ", ".join(sorted(invalid_waivers)),
        ))
    return findings
