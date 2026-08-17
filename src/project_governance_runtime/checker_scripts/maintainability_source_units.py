#!/usr/bin/env python3
"""Measure changed architectural source units and apply reviewed decisions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from maintainability_analysis import (
    ADAPTER_CAPABILITIES,
    EngineAnalysisFailure,
    function_metric_violations,
    parsed_source,
)
from maintainability_dispositions import disposition_for, fingerprint


TEMPLATE_SOURCE_REVIEW_TRIGGER = 500
Range = tuple[int, int]
Extent = tuple[str, str, int, int]


@dataclass(frozen=True)
class SourceSelection:
    """Pair stable finding identity with the exact bytes and ranges to analyze."""

    repository_path: Path
    content_path: Path
    is_new: bool
    ranges: tuple[Range, ...]
    explicit: bool = False
    architecture_identity_changed: bool = False

    @property
    def is_direct(self) -> bool:
        """Return whether this run directly governs any content in the source."""
        return (
            self.explicit
            or self.is_new
            or self.architecture_identity_changed
            or bool(self.ranges)
        )


def finding(
    rule_id: str,
    path: Path,
    line: int,
    symbol: str,
    actual: int,
    threshold: int,
    message: str,
    severity: str = "blocking",
) -> dict[str, Any]:
    """Build one normalized finding record shared by every language adapter."""
    return {
        "rule_id": rule_id,
        "path": path.as_posix(),
        "line": line,
        "symbol": symbol,
        "actual": actual,
        "threshold": threshold,
        "severity": severity,
        "message": message,
    }


def _reviewed_finding(
    rule_id: str,
    selection: SourceSelection,
    line: int,
    symbol: str,
    actual: int,
    threshold: int,
    message: str,
    sha: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Convert one threshold trigger into a blocking or accepted review result."""
    accepted, reason = disposition_for(
        rule_id, selection.repository_path, symbol, actual, sha, config
    )
    return finding(
        rule_id,
        selection.repository_path,
        line,
        symbol,
        actual,
        threshold,
        f"{message} {reason}",
        "accepted" if accepted else "blocking",
    )


def source_size_policy(
    policy_path: Path,
    file_limit: int,
    type_limit: int,
) -> tuple[int, list[dict[str, Any]]]:
    """Validate one shared 500-line review point for architectural source units."""
    findings: list[dict[str, Any]] = []
    for key, value in {
        "file_lines_blocking": file_limit,
        "type_lines_blocking": type_limit,
    }.items():
        if value <= 0:
            findings.append(finding(
                "quality.source-size-policy", policy_path, 1, key, value, 1,
                "Source-size thresholds must be positive integers.",
            ))
    if file_limit != type_limit:
        findings.append(finding(
            "quality.source-size-policy", policy_path, 1, "file/type blocking thresholds",
            file_limit, type_limit,
            "Parser-free files and parser-recognized architectural units use one line limit.",
        ))
    if max(file_limit, type_limit) > TEMPLATE_SOURCE_REVIEW_TRIGGER:
        findings.append(finding(
            "quality.source-size-policy", policy_path, 1, "shared source-size review trigger",
            max(file_limit, type_limit), TEMPLATE_SOURCE_REVIEW_TRIGGER,
            "The shared review trigger may run earlier but cannot run later than 500 lines.",
        ))
    return max(1, min(file_limit, type_limit, TEMPLATE_SOURCE_REVIEW_TRIGGER)), findings


def analysis_policy(policy_path: Path, policy: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate parser-free fallback enforcement and truthful native enrichment."""
    maintainability = policy.get("maintainability", {})
    findings: list[dict[str, Any]] = []
    neutral_checks = maintainability.get("language_neutral_checks", [])
    if not isinstance(neutral_checks, list) or "physical-file-size" not in neutral_checks:
        findings.append(finding(
            "quality.analysis-policy", policy_path, 1, "language_neutral_checks", 0, 1,
            "Maintainability policy must retain physical-file-size as the parser-free fallback.",
        ))
    active_adapters = maintainability.get("active_adapters", [])
    if not isinstance(active_adapters, list) or set(active_adapters) != set(ADAPTER_CAPABILITIES):
        findings.append(finding(
            "quality.analysis-policy", policy_path, 1, "active_adapters",
            len(active_adapters) if isinstance(active_adapters, list) else 0,
            len(ADAPTER_CAPABILITIES),
            "Policy active_adapters must exactly match the analyzers shipped by this checker.",
        ))
    if maintainability.get("declaration_enrichment") != "optional-native":
        findings.append(finding(
            "quality.analysis-policy", policy_path, 1, "declaration_enrichment", 0, 1,
            "Declaration enrichment must remain optional and use registered native parsers.",
        ))
    return findings


def _merged_intervals(intervals: list[Range]) -> list[Range]:
    """Merge overlapping extents before measuring an exclusive source unit."""
    merged: list[list[int]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(start, end) for start, end in merged]


def _exclusive_segments(start: int, end: int, excluded: list[Range]) -> list[Range]:
    """Subtract nested architectural extents from one enclosing physical extent."""
    cursor = start
    result: list[Range] = []
    for excluded_start, excluded_end in _merged_intervals(excluded):
        if excluded_end < cursor or excluded_start > end:
            continue
        if excluded_start > cursor:
            result.append((cursor, min(excluded_start - 1, end)))
        cursor = max(cursor, excluded_end + 1)
    if cursor <= end:
        result.append((cursor, end))
    return result


def _intersects(segments: list[Range], ranges: tuple[Range, ...]) -> bool:
    """Return whether any changed after-image line belongs to these segments."""
    return any(
        segment_start <= range_end and range_start <= segment_end
        for segment_start, segment_end in segments
        for range_start, range_end in ranges
    )


def _direct(
    selection: SourceSelection,
    segments: list[Range],
    *,
    include_architecture_rename: bool = False,
) -> bool:
    """Apply full or exact-range scope without rescanning functions on a pure rename."""
    full_scope = selection.is_new or selection.explicit or (
        include_architecture_rename and selection.architecture_identity_changed
    )
    return (
        full_scope and bool(segments)
    ) or _intersects(segments, selection.ranges)


def _type_segments(extent: Extent, types: list[Extent]) -> list[Range]:
    """Measure one type without aggregating nested architectural declarations."""
    _, _, start, end = extent
    nested = [
        (other_start, other_end)
        for other_kind, _, other_start, other_end in types
        if other_kind == "type"
        and start <= other_start
        and other_end <= end
        and (start, end) != (other_start, other_end)
    ]
    return _exclusive_segments(start, end, nested)


def _segment_size(segments: list[Range]) -> int:
    """Count physical lines owned by one exclusive architectural source unit."""
    return sum(end - start + 1 for start, end in segments)


def _size_findings(
    selection: SourceSelection,
    extents: list[Extent],
    line_count: int,
    source_limit: int,
    sha: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Emit one nonduplicated file or type obligation for each changed source unit."""
    findings: list[dict[str, Any]] = []
    types = [extent for extent in extents if extent[0] == "type"]
    top_level_functions = [
        extent
        for extent in extents
        if extent[0] == "function"
        and not any(
            type_start <= extent[2] and extent[3] <= type_end
            for _, _, type_start, type_end in types
        )
    ]
    file_segments = _exclusive_segments(
        1,
        max(line_count, 1),
        [
            (start, end)
            for _, _, start, end in [*types, *top_level_functions]
        ],
    )
    file_size = line_count if not extents else _segment_size(file_segments)
    if file_size > source_limit and _direct(
        selection, file_segments, include_architecture_rename=True
    ):
        findings.append(_reviewed_finding(
            "quality.large-file", selection, 1, "<file>", file_size, source_limit,
            "File-level or parser-free code exceeds the architectural review trigger.", sha, config,
        ))
    for extent in types:
        _, name, start, _ = extent
        segments = _type_segments(extent, types)
        lines = _segment_size(segments)
        if lines > source_limit and _direct(
            selection, segments, include_architecture_rename=True
        ):
            findings.append(_reviewed_finding(
                "quality.large-type", selection, start, name, lines, source_limit,
                "Changed type exceeds the architectural review trigger.", sha, config,
            ))
    return findings


def _function_findings(
    selection: SourceSelection,
    extents: list[Extent],
    function_metrics: dict[tuple[str, int], tuple[int, int, int]],
    capabilities: frozenset[str],
    thresholds: dict[str, Any],
    sha: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Evaluate only functions whose own extent intersects the changed range."""
    findings: list[dict[str, Any]] = []
    function_limit = int(thresholds.get("function_lines_blocking", 100))
    limits = (
        int(thresholds.get("cyclomatic_complexity_blocking", 15)),
        int(thresholds.get("cognitive_complexity_blocking", 25)),
        int(thresholds.get("nesting_depth_blocking", 5)),
    )
    for kind, name, start, end in extents:
        if kind != "function" or not _direct(selection, [(start, end)]):
            continue
        lines = end - start + 1
        if lines > function_limit:
            findings.append(_reviewed_finding(
                "quality.large-function", selection, start, name, lines, function_limit,
                "Changed function exceeds the readable length trigger.", sha, config,
            ))
        metrics = function_metrics.get((name, start), (1, 0, 0))
        for rule_id, actual, threshold, message in function_metric_violations(
            metrics, capabilities, limits
        ):
            findings.append(_reviewed_finding(
                rule_id, selection, start, name, actual, threshold, message, sha, config
            ))
    return findings


def analyze_source(
    selection: SourceSelection,
    thresholds: dict[str, Any],
    source_limit: int,
    config: dict[str, Any],
    coverage: dict[str, int],
) -> tuple[list[dict[str, Any]], set[str]]:
    """Return changed-unit findings and current symbols for one exact source image."""
    text = selection.content_path.read_text(encoding="utf-8", errors="replace")
    sha = fingerprint(selection.content_path)
    try:
        parsed = parsed_source(selection.content_path, text)
    except SyntaxError as error:
        return [finding(
            "quality.parse-failed", selection.repository_path, error.lineno or 1, "<file>",
            0, 0, f"Maintainability adapter could not parse this file: {error.msg}",
        )], set()
    except EngineAnalysisFailure as error:
        coverage["engine-failed"] += 1
        return [finding(
            "quality.engine-failed", selection.repository_path, 1, "<file>", 1, 0,
            f"Structural analysis infrastructure failed: {error}",
        )], set()
    if parsed is None:
        coverage["unenriched"] += 1
        extents: list[Extent] = []
        function_metrics: dict[tuple[str, int], tuple[int, int, int]] = {}
        capabilities = frozenset()
    else:
        extents, function_metrics, adapter, capabilities = parsed
        coverage[adapter] += 1
    findings = _size_findings(
        selection, extents, len(text.splitlines()), source_limit, sha, config
    )
    findings.extend(_function_findings(
        selection, extents, function_metrics, capabilities, thresholds, sha, config
    ))
    return findings, {name for _, name, _, _ in extents} | {"<file>"}
