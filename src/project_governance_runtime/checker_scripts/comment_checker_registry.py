"""Validate comment-policy registrations and apply narrowly scoped waivers.

The CLI delegates this policy integrity work here so registry consistency and waiver evaluation
remain independently readable without changing the checker result contract.
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Any

from governance_schema import validate_document
from source_comment_analysis import SOURCE_FAMILIES, add, analyzer_version_supported, resolved_fixture_path


def apply_waivers(findings: list[dict[str, Any]], waivers: dict[str, Any]) -> None:
    """Downgrade only exact, current, declaration-qualified waiver matches."""
    today = date.today()
    eligible = (finding for finding in findings if finding["rule_id"] not in {"SC001", "SC010"})
    for finding in eligible:
        waiver = next((item for item in waivers.get("waivers", []) if waiver_matches(item, finding, today)), None)
        if waiver is not None:
            finding["severity"] = "waived"


def waiver_matches(waiver: object, finding: dict[str, Any], today: date) -> bool:
    """Return whether one complete waiver may downgrade the supplied finding."""
    if not isinstance(waiver, dict) or waiver.get("rule_id") != finding["rule_id"]:
        return False
    waiver_path = Path(str(waiver.get("path", ""))).as_posix()
    finding_path = Path(str(finding["path"])).as_posix()
    if waiver_path != finding_path or not waiver_has_matching_scope(waiver, finding):
        return False
    try:
        expiry = date.fromisoformat(str(waiver.get("expires", "")))
    except ValueError:
        return False
    return expiry >= today and bool(str(waiver.get("rationale", "")).strip()) and bool(str(waiver.get("owner", "")).strip())


def waiver_has_matching_scope(waiver: dict[str, Any], finding: dict[str, Any]) -> bool:
    """Match the stable path/rule/symbol key without line- or digest-based scope."""
    adapter_matches = not waiver.get("adapter_id") or waiver.get("adapter_id") == finding.get("adapter_id")
    declaration_matches = bool(waiver.get("declaration")) and waiver.get("declaration") == finding.get("declaration")
    return adapter_matches and declaration_matches


def waiver_integrity_findings(waivers: dict[str, Any], path: Path) -> list[dict[str, Any]]:
    """Fail closed on expired waivers even when no current source finding matches them."""
    findings: list[dict[str, Any]] = []
    today = date.today()
    for index, waiver in enumerate(waivers.get("waivers", []), start=1):
        expiry = waiver_expiry(waiver)
        if expiry is not None and expiry < today:
            add(findings, "SC010", path, 1, f"Source-comment waiver {index} expired on {expiry.isoformat()}.")
    return findings


def waiver_expiry(waiver: object) -> date | None:
    """Read one waiver expiry without treating malformed optional data as an expiry finding."""
    if not isinstance(waiver, dict):
        return None
    try:
        return date.fromisoformat(str(waiver.get("expires", "")))
    except ValueError:
        return None


def registry_findings(
    policy: dict[str, Any],
    registry: dict[str, Any],
    waivers: dict[str, Any],
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Validate policy, waiver, and adapter truthfulness before source analysis."""
    findings = schema_findings(policy, registry, waivers, args)
    findings.extend(waiver_integrity_findings(waivers, args.waivers))
    adapters, entries = registered_adapters(registry)
    findings.extend(adapter_registry_findings(entries, adapters, args.adapters))
    findings.extend(active_adapter_findings(policy, adapters, args.policy))
    return findings, adapters


def schema_findings(
    policy: dict[str, Any], registry: dict[str, Any], waivers: dict[str, Any], args: argparse.Namespace
) -> list[dict[str, Any]]:
    """Normalize schema failures for each policy document before semantic validation."""
    findings: list[dict[str, Any]] = []
    documents = (
        (policy, args.policy_schema, args.policy),
        (registry, args.adapters_schema, args.adapters),
        (waivers, args.waivers_schema, args.waivers),
    )
    for document, schema, path in documents:
        for error in validate_document(document, schema, path.as_posix()):
            add(findings, "SC010", path, 1, error)
    return findings


def registered_adapters(registry: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Return language-indexed adapter records and the valid source registry entries."""
    entries = [item for item in registry.get("adapters", []) if isinstance(item, dict) and item.get("language")]
    return {str(item["language"]): item for item in entries}, entries


def adapter_registry_findings(
    entries: list[dict[str, Any]], adapters: dict[str, dict[str, Any]], registry: Path
) -> list[dict[str, Any]]:
    """Confirm adapter languages, evidence, and extensions match shipped source families."""
    findings: list[dict[str, Any]] = []
    languages = [str(item["language"]) for item in entries]
    if len(languages) != len(set(languages)):
        add(findings, "SC010", registry, 1, "Adapter registry contains duplicate language entries.")
    for family in sorted(set(SOURCE_FAMILIES.values()) - set(adapters)):
        add(findings, "SC010", registry, 1, f"Adapter registry is missing managed language '{family}'.")
    for family, adapter in sorted(adapters.items()):
        if adapter.get("status") == "active" and active_adapter_lacks_evidence(family, adapter):
            add(findings, "SC010", registry, 1, f"Active adapter '{family}' lacks analyzer, capability, or fixture evidence.")
        expected_extensions = {suffix for suffix, mapped_family in SOURCE_FAMILIES.items() if mapped_family == family}
        if set(str(value) for value in adapter.get("extensions", [])) != expected_extensions:
            add(findings, "SC010", registry, 1, f"Adapter '{family}' extensions disagree with the managed source-family registry.")
    return findings


def active_adapter_lacks_evidence(family: str, adapter: dict[str, Any]) -> bool:
    """Return whether an active adapter lacks a supported analyzer or fixture proof."""
    cases = [case for case in adapter.get("fixture_cases", []) if isinstance(case, dict)]
    evidence_missing = not cases or any(not resolved_fixture_path(Path(str(case.get("path", "")))).is_file() for case in cases)
    version_mismatch = not analyzer_version_supported(family, str(adapter.get("analyzer", "")), adapter.get("analyzer_version"))
    return adapter.get("analyzer") in {None, "", "none"} or not adapter.get("capabilities") or evidence_missing or version_mismatch


def active_adapter_findings(
    policy: dict[str, Any], adapters: dict[str, dict[str, Any]], policy_path: Path
) -> list[dict[str, Any]]:
    """Confirm the policy activates exactly the registry's active adapter languages."""
    registered_active = {family for family, item in adapters.items() if item.get("status") == "active"}
    policy_active = {str(value) for value in policy.get("active_adapters", [])}
    if registered_active == policy_active:
        return []
    findings: list[dict[str, Any]] = []
    add(findings, "SC010", policy_path, 1, "Active adapter policy and adapter registry disagree.")
    return findings
