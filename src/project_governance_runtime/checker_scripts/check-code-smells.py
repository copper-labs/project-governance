#!/usr/bin/env python3
"""Enforce maintainability review for new and directly changed source units."""

from __future__ import annotations

import argparse
import fnmatch
import json
from pathlib import Path
from typing import Any

import yaml

from governance_changed_paths import (
    changed_path_views,
    packet_records,
    template_managed_paths,
)
from finding_lifecycle import finding_summary
from maintainability_analysis import ADAPTER_CAPABILITIES
from maintainability_dispositions import (
    fingerprint,
    integrity_findings,
    validated_config,
)
from maintainability_source_units import (
    TEMPLATE_SOURCE_REVIEW_TRIGGER,
    SourceSelection,
    analysis_policy,
    analyze_source,
    source_size_policy,
)


SOURCE_SUFFIXES = {
    ".astro", ".c", ".cc", ".cjs", ".clj", ".cljc", ".cljs", ".cpp", ".cs", ".cts",
    ".cxx", ".dart", ".erl", ".ex", ".exs", ".fs", ".fsx", ".go", ".gradle", ".groovy",
    ".h", ".hpp", ".hrl", ".hxx", ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".m",
    ".mjs", ".mm", ".mts", ".php", ".py", ".rb", ".rs", ".scala", ".sh", ".sql", ".svelte",
    ".swift", ".ts", ".tsx", ".vue",
}
DEFAULT_POLICY = Path("config/policies/code-quality.yaml")
DEFAULT_DISPOSITIONS = Path("config/policies/code-quality-dispositions.yaml")


def load_yaml(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    """Read a mapping, using fallback only when the optional file is absent."""
    if not path.exists():
        return fallback
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        return {"invalid_yaml": str(error)}
    if not isinstance(value, dict):
        return {"invalid_document_shape": type(value).__name__}
    return value


def _repository_identity(path: Path) -> str | None:
    """Return a target-owned configuration path relative to the checker root."""
    if not path.is_absolute():
        return path.as_posix()
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return None


def subject_yaml(
    path: Path,
    fallback: dict[str, Any],
    mode: str,
) -> dict[str, Any]:
    """Load a changed configuration from the packet's exact after-image when present."""
    if mode not in {"all", "explicit"}:
        identity = _repository_identity(path)
        record = next(
            (
                item
                for item in packet_records(mode)
                if identity is not None
                and (item["path"] == identity or item.get("previous_path") == identity)
            ),
            None,
        )
        if record is not None:
            if record["status"] == "deleted":
                return {"invalid_document_shape": "deleted"}
            path = Path(record["after_path"])
    return load_yaml(path, fallback)


def _mode(args: argparse.Namespace) -> str:
    """Translate checker arguments to the runtime packet convention."""
    return "all" if args.all else "changed" if args.changed else "staged"


def _packet_selections(mode: str) -> list[SourceSelection]:
    """Build exact-content selections from the runtime packet or explicit all scope."""
    if mode == "all":
        return [
            SourceSelection(
                Path(path), content, is_new=is_new, ranges=(), explicit=True
            )
            for path, content, is_new in changed_path_views(mode)
        ]
    return [
        SourceSelection(
            Path(record["path"]),
            Path(record["after_path"]),
            is_new=record["status"] == "added",
            ranges=tuple(
                (changed_range["start"], changed_range["end"])
                for changed_range in record["changed_ranges"]
            ),
            architecture_identity_changed=record["status"] == "renamed",
        )
        for record in packet_records(mode)
        if record["status"] != "deleted"
    ]


def _explicit_selections(paths: list[str]) -> list[SourceSelection]:
    """Treat named diagnostic paths as fully governed source units."""
    return [
        SourceSelection(Path(value), Path(value), True, (), True)
        for value in sorted(set(paths))
    ]


def selected_sources(
    args: argparse.Namespace,
    policy: dict[str, Any],
    frozen_paths: list[str] | None = None,
) -> list[SourceSelection]:
    """Select exact changed source bytes after policy and ownership exclusions."""
    if frozen_paths is not None:
        selected = set(frozen_paths)
        candidates = [
            selection
            for selection in _packet_selections(_mode(args))
            if selection.repository_path.as_posix() in selected
        ]
        managed = template_managed_paths()
    elif args.path:
        candidates = _explicit_selections(list(args.path))
        managed = set()
    else:
        candidates = _packet_selections(_mode(args))
        managed = template_managed_paths()
    ignored = policy.get("maintainability", {}).get(
        "ignore_paths", policy.get("naming", {}).get("ignore_paths", [])
    )
    return sorted(
        {
            selection
            for selection in candidates
            if selection.repository_path.as_posix() not in managed
            and selection.content_path.is_file()
            and selection.repository_path.suffix.lower() in SOURCE_SUFFIXES
            and not any(
                fnmatch.fnmatch(selection.repository_path.as_posix(), str(pattern))
                for pattern in ignored
            )
        },
        key=lambda item: item.repository_path.as_posix(),
    )


def governed_selection_file(path: Path) -> list[str]:
    """Load exact paths previously resolved by this engine."""
    value = json.loads(path.read_text(encoding="utf-8"))
    records = value.get("selectedInputs", []) if isinstance(value, dict) else []
    if not isinstance(records, list):
        raise ValueError("governance selection file has invalid selectedInputs")
    return [
        str(record["path"])
        for record in records
        if isinstance(record, dict) and isinstance(record.get("path"), str)
    ]


def main() -> int:
    """Audit selected source units and emit one bounded maintainability envelope."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--changed", action="store_true")
    mode.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    parser.add_argument("--dispositions", type=Path, default=DEFAULT_DISPOSITIONS)
    parser.add_argument(
        "--disposition-schema", type=Path, default=Path("schema/quality-disposition.schema.json")
    )
    parser.add_argument("--governance-selection-only", action="store_true")
    parser.add_argument("--governance-selection-file", type=Path)
    args = parser.parse_args()
    frozen_paths = (
        governed_selection_file(args.governance_selection_file)
        if args.governance_selection_file
        else None
    )
    input_mode = "explicit" if args.path else _mode(args)
    policy = subject_yaml(args.policy, {}, input_mode)
    raw_config = subject_yaml(
        args.dispositions,
        {"version": 2, "owner": "runtime", "dispositions": []},
        input_mode,
    )
    selected = selected_sources(args, policy, frozen_paths)
    if args.governance_selection_only:
        print(json.dumps({
            "version": 1,
            "check": "code-smell-selection",
            "status": "passed",
            "finding_count": 0,
            "findings": [],
            "selected_inputs": [
                {"path": selection.repository_path.as_posix()} for selection in selected
            ],
        }, indent=2))
        return 0
    thresholds = policy.get("maintainability", {}).get("thresholds", {})
    source_limit, findings = source_size_policy(
        args.policy,
        int(thresholds.get("file_lines_blocking", TEMPLATE_SOURCE_REVIEW_TRIGGER)),
        int(thresholds.get("type_lines_blocking", TEMPLATE_SOURCE_REVIEW_TRIGGER)),
    )
    findings.extend(analysis_policy(args.policy, policy))
    config, config_findings = validated_config(
        raw_config, args.disposition_schema, args.dispositions
    )
    findings.extend(config_findings)
    coverage: dict[str, int] = {
        **{adapter: 0 for adapter in ADAPTER_CAPABILITIES},
        "unenriched": 0,
        "engine-failed": 0,
    }
    symbols: dict[str, set[str]] = {}
    source_fingerprints: dict[str, str] = {}
    for selection in selected:
        if not selection.is_direct:
            continue
        source_findings, source_symbols = analyze_source(
            selection, thresholds, source_limit, config, coverage
        )
        findings.extend(source_findings)
        path = selection.repository_path.as_posix()
        symbols[path] = source_symbols
        source_fingerprints[path] = fingerprint(selection.content_path)
    integrity_mode = "explicit" if args.path else _mode(args)
    findings.extend(integrity_findings(
        config,
        args.dispositions,
        integrity_mode,
        symbols,
        source_fingerprints,
        {
            (item.get("rule_id"), item.get("path"), item.get("symbol"))
            for item in findings
        },
    ))
    summary = finding_summary(findings)
    print(json.dumps({
        "version": 1,
        "check": "code-smell",
        **summary,
        "adapter_capabilities": {
            adapter: sorted(capabilities)
            for adapter, capabilities in ADAPTER_CAPABILITIES.items()
        },
        "coverage": coverage,
        "findings": findings,
    }, indent=2))
    return 1 if summary["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
