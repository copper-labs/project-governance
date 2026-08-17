#!/usr/bin/env python3
"""Responsibility: Enforce deterministic package-aware naming policy for new and renamed files.

Context: The naming validation pack uses changed-path classification and narrow waivers here so new
ambiguity blocks without turning untouched naming debt into an unrelated failure.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from governance_changed_paths import changed_path_records, template_managed_paths
from finding_lifecycle import finding_summary


ROOT = Path.cwd()
DEFAULT_POLICY = ROOT / "config/policies/code-quality.yaml"
DEFAULT_WAIVERS = ROOT / "config/policies/code-quality-waivers.yaml"
SOURCE_SUFFIXES = {
    ".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".js", ".jsx",
    ".kt", ".kts", ".m", ".mm", ".php", ".py", ".rb", ".rs", ".scala", ".swift",
    ".ts", ".tsx",
}
WAIVABLE_RULE_IDS = {
    "naming.adjacent-duplicate",
    "naming.file-name-blocking-length",
    "naming.file-name-preferred-length",
    "naming.forbidden-term",
    "naming.package-repetition",
    "naming.vague-role",
}


def load_yaml(path: Path) -> dict[str, Any]:
    """Load one YAML mapping and fail closed."""
    if not path.exists():
        raise ValueError(f"{path.relative_to(ROOT)}: missing")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT)}: expected YAML mapping")
    return data


def words(value: str) -> list[str]:
    """Split a file or package name into lowercase semantic words."""
    expanded = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    return [part.lower() for part in re.split(r"[^A-Za-z0-9]+", expanded) if part]


def git_lines(args: list[str]) -> list[str] | None:
    """Return Git output lines, or None outside a Git worktree."""
    probe = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], cwd=ROOT, text=True, capture_output=True, check=False)
    if probe.returncode != 0:
        return None
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return [line for line in result.stdout.splitlines() if line.strip()]


def candidate_paths(*, mode: str, explicit: list[str]) -> list[tuple[str, bool]]:
    """Return current candidate paths paired with new-or-renamed classification."""
    if explicit:
        return sorted({(Path(value).as_posix(), True) for value in explicit})
    if git_lines(["rev-parse", "--is-inside-work-tree"]) is not None:
        if mode == "tracked":
            records = [(path, False) for path in sorted(set(git_lines(["ls-files"]) or []))]
        else:
            records = changed_path_records(mode)
    else:
        records = [
            (path.relative_to(ROOT).as_posix(), False)
            for path in sorted(ROOT.rglob("*"))
            if path.is_file() and not {".git", ".agent"} & set(path.relative_to(ROOT).parts)
        ]
    managed = template_managed_paths()
    return [
        (path, is_new)
        for path, is_new in records
        if path not in managed
        and (
            Path(path).suffix.lower() not in SOURCE_SUFFIXES
            or ((ROOT / path).is_file() and not (ROOT / path).is_symlink())
        )
    ]


def governed_candidate_records(
    candidates: list[tuple[str, bool]],
    policy: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return only paths for which the naming engine evaluates rules."""
    naming = (
        policy.get("naming", {})
        if isinstance(policy.get("naming"), dict)
        else {}
    )
    ignored = [str(value) for value in naming.get("ignore_paths", []) or []]
    return [
        {"path": path, "isNewOrRenamed": is_new}
        for path, is_new in candidates
        if Path(path).suffix.lower() in SOURCE_SUFFIXES
        and not any(fnmatch.fnmatch(path, pattern) for pattern in ignored)
    ]


def selection_file(path: Path) -> list[tuple[str, bool]]:
    """Restore exact path classification emitted by this engine."""
    value = json.loads(path.read_text(encoding="utf-8"))
    records = value.get("selectedInputs", []) if isinstance(value, dict) else []
    if not isinstance(records, list):
        raise ValueError("governance selection file is invalid")
    return [
        (str(record["path"]), bool(record.get("isNewOrRenamed")))
        for record in records
        if isinstance(record, dict) and isinstance(record.get("path"), str)
    ]


def package_words(path: Path, package_roots: list[str]) -> list[str]:
    """Return the package segment for a path under a configured package root."""
    parts = path.parts
    for index, part in enumerate(parts[:-1]):
        if part in package_roots and index + 1 < len(parts) - 1:
            return words(parts[index + 1])
    return []


def waiver_matches(waiver: dict[str, Any], finding: dict[str, Any]) -> bool:
    """Return whether a waiver narrowly matches one finding."""
    if waiver.get("rule_id") != finding["rule_id"]:
        return False
    if waiver.get("path") != finding["path"]:
        return False
    if waiver.get("name") and waiver.get("name") != finding["name"]:
        return False
    return True


def exact_waiver_path(value: Any) -> str | None:
    """Return a normalized exact repo-relative waiver path, or None when broad/unsafe."""
    raw = str(value or "").strip()
    if not raw or "\\" in raw or any(character in raw for character in "*?["):
        return None
    candidate = PurePosixPath(raw)
    if candidate.is_absolute() or raw != candidate.as_posix() or ".." in candidate.parts:
        return None
    if candidate.name in {"", ".", ".."}:
        return None
    return candidate.as_posix()


def validate_waivers(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return valid waivers and waiver-contract findings."""
    valid: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    for index, waiver in enumerate(data.get("waivers", []) or [], 1):
        if not isinstance(waiver, dict):
            findings.append({"rule_id": "naming.waiver-invalid", "path": str(DEFAULT_WAIVERS.relative_to(ROOT)), "name": str(index), "severity": "blocking", "message": "waiver must be a mapping"})
            continue
        missing = [key for key in ("rule_id", "path", "owner", "expires", "rationale") if not str(waiver.get(key, "")).strip()]
        waiver_path = exact_waiver_path(waiver.get("path"))
        rule_id = str(waiver.get("rule_id", "")).strip()
        try:
            expires = date.fromisoformat(str(waiver.get("expires", "")))
        except ValueError:
            expires = None
        if (
            missing
            or expires is None
            or len(str(waiver.get("rationale", "")).strip()) < 20
            or rule_id not in WAIVABLE_RULE_IDS
            or waiver_path is None
        ):
            findings.append({"rule_id": "naming.waiver-invalid", "path": str(DEFAULT_WAIVERS.relative_to(ROOT)), "name": str(index), "severity": "blocking", "message": "waiver requires an exact waivable rule_id, an exact normalized repo-relative file path, owner, ISO expiry, and specific rationale"})
            continue
        if expires < date.today():
            findings.append({"rule_id": "naming.waiver-expired", "path": waiver_path, "name": str(waiver.get("name", "*")), "severity": "blocking", "message": f"waiver expired on {expires.isoformat()}"})
            continue
        waiver["rule_id"] = rule_id
        waiver["path"] = waiver_path
        valid.append(waiver)
    return valid, findings


def naming_finding(rule_id: str, message: str, path: Path, is_new: bool, *, blocking: bool = True) -> dict[str, Any]:
    """Normalize one diagnostic with stable severity and new-versus-existing classification."""
    return {
        "rule_id": rule_id,
        "path": path.as_posix(),
        "name": path.stem,
        "severity": "blocking" if blocking and is_new else "advisory",
        "classification": "new-or-renamed" if is_new else "existing-debt",
        "message": message,
    }


def word_rule_findings(path: Path, is_new: bool, naming: dict[str, Any]) -> list[dict[str, Any]]:
    """Check forbidden, repeated, and vague filename words."""
    stem_words = words(path.stem)
    findings: list[dict[str, Any]] = []
    forbidden = {str(value).lower() for value in naming.get("forbidden_terms", []) or []}
    matched_forbidden = sorted(forbidden & set(stem_words))
    if matched_forbidden:
        findings.append(naming_finding("naming.forbidden-term", f"contains forbidden term(s): {', '.join(matched_forbidden)}", path, is_new))
    if any(left == right for left, right in zip(stem_words, stem_words[1:])):
        findings.append(naming_finding("naming.adjacent-duplicate", "contains adjacent duplicate words", path, is_new))
    vague = {str(value).lower() for value in naming.get("vague_terms", []) or []}
    if stem_words and (stem_words[-1] in vague or (len(stem_words) == 1 and stem_words[0] in vague)):
        findings.append(naming_finding("naming.vague-role", f"ends in vague role term {stem_words[-1]!r}", path, is_new))
    return findings


def package_rule_findings(path: Path, is_new: bool, naming: dict[str, Any]) -> list[dict[str, Any]]:
    """Check repetition of the containing package name."""
    stem_words = words(path.stem)
    package = package_words(path, [str(value) for value in naming.get("package_roots", ["packages", "services"]) or []])
    conventional = {str(value).lower() for value in naming.get("conventional_stems", []) or []}
    conventional_words = (["index"], ["main"], ["app"])
    repeats = package and stem_words not in conventional_words and path.stem.lower() not in conventional
    if repeats and stem_words[:len(package)] == package:
        return [naming_finding("naming.package-repetition", "repeats the containing package name", path, is_new)]
    return []


def length_rule_findings(path: Path, is_new: bool, naming: dict[str, Any]) -> list[dict[str, Any]]:
    """Check preferred and blocking filename length limits."""
    preferred = int(naming.get("preferred_file_name_length", 48))
    blocking = int(naming.get("blocking_file_name_length", 72))
    if len(path.stem) > blocking:
        return [naming_finding("naming.file-name-blocking-length", f"file stem length {len(path.stem)} exceeds blocking limit {blocking}", path, is_new)]
    if len(path.stem) > preferred:
        return [naming_finding("naming.file-name-preferred-length", f"file stem length {len(path.stem)} exceeds preferred limit {preferred}", path, is_new, blocking=False)]
    return []


def analyze(path_text: str, is_new: bool, policy: dict[str, Any]) -> list[dict[str, Any]]:
    """Return naming findings for one source path."""
    path = Path(path_text)
    if path.suffix.lower() not in SOURCE_SUFFIXES:
        return []
    naming = policy.get("naming", {}) if isinstance(policy.get("naming"), dict) else {}
    ignored = [str(value) for value in naming.get("ignore_paths", []) or []]
    if any(fnmatch.fnmatch(path_text, pattern) for pattern in ignored):
        return []
    return [
        *word_rule_findings(path, is_new, naming),
        *package_rule_findings(path, is_new, naming),
        *length_rule_findings(path, is_new, naming),
    ]


def main() -> int:
    """Run the naming policy check."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[], help="Explicit path; treated as new or renamed.")
    parser.add_argument("--policy", default=DEFAULT_POLICY.as_posix())
    parser.add_argument("--waivers", default=DEFAULT_WAIVERS.as_posix())
    parser.add_argument("--json-output")
    parser.add_argument("--governance-selection-only", action="store_true")
    parser.add_argument("--governance-selection-file", type=Path)
    args = parser.parse_args()
    try:
        policy = load_yaml(Path(args.policy))
        waiver_data = load_yaml(Path(args.waivers))
        waivers, findings = validate_waivers(waiver_data)
        mode = "all" if args.all else "changed" if args.changed else "staged" if args.staged else "tracked"
        candidates = (
            selection_file(args.governance_selection_file)
            if args.governance_selection_file
            else candidate_paths(mode=mode, explicit=args.path)
        )
        records = governed_candidate_records(candidates, policy)
        if args.governance_selection_only:
            print(json.dumps({
                "version": 1,
                "kind": "governance-selection-result",
                "status": "passed",
                "finding_count": 0,
                "findings": [],
                "selected_inputs": records,
            }, indent=2, sort_keys=True))
            return 0
        for record in records:
            path = str(record["path"])
            is_new = bool(record["isNewOrRenamed"])
            findings.extend(analyze(path, is_new, policy))
        for finding in findings:
            if finding["rule_id"].startswith("naming.waiver-"):
                continue
            if any(waiver_matches(waiver, finding) for waiver in waivers):
                finding["waived"] = True
                finding["severity"] = "waived"
        findings.sort(key=lambda item: (item["path"], item["rule_id"], item["name"]))
        result = {
            "version": 1,
            "kind": "governance-check-result",
            **finding_summary(findings),
            "findings": findings,
        }
    except (OSError, ValueError, yaml.YAMLError) as exc:
        result = {"version": 1, "kind": "governance-check-result", "status": "failed", "finding_count": 1, "findings": [{"rule_id": "naming.policy-invalid", "severity": "blocking", "message": str(exc)}]}
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.json_output:
        output = Path(args.json_output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 1 if result["status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
