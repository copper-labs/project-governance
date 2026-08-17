"""Own bounded predecessor artifact inventory and pruning for runtime updates."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from typing import Any

import yaml


LEGACY_GENERATED_LOCK_PATH = Path("config/governance/generated-files.lock.yaml")
LEGACY_INSTALL_RECEIPT_PATH = Path("config/governance/install-receipt.yaml")
CURRENT_RUNTIME_PATHS = frozenset({
    "config/governance/runtime.lock.yaml",
    "tools/governance-bootstrap.py",
    ".githooks/commit-msg",
    ".githooks/pre-commit",
    ".githooks/pre-push",
    ".githooks/pre-pr",
})
IGNORED_RUNTIME_PURGE_PATHS = (
    Path(".agent/upgrade-runs"),
    Path(".agent/upgrade-preparations"),
    Path(".agent/context-router"),
    Path(".agent/governance-plane/runs"),
)


def _sha256(path: Path) -> str:
    """Return the exact bytes identity used by predecessor ownership evidence."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_optional_mapping(path: Path) -> dict[str, Any] | None:
    """Load one optional YAML mapping without treating an absent file as an error."""
    if not path.is_file() or path.is_symlink():
        return None
    value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return value if isinstance(value, dict) else None


def _safe_manifest_path(value: Any) -> str | None:
    """Normalize one manifest path only when it remains repository-relative."""
    if not isinstance(value, str):
        return None
    path = Path(value)
    if path.is_absolute() or not path.parts or ".." in path.parts:
        return None
    normalized = path.as_posix()
    return normalized if normalized not in {"", "."} else None


def _root_candidate(root: Path, relative: str) -> tuple[Path | None, str | None]:
    """Resolve one candidate beneath root while rejecting every symlink component."""
    root_resolved = root.resolve()
    candidate = root
    for component in Path(relative).parts:
        candidate /= component
        if candidate.is_symlink():
            return None, f"path component is a symlink: {candidate.relative_to(root).as_posix()}"
    try:
        candidate.resolve(strict=False).relative_to(root_resolved)
    except ValueError:
        return None, "resolved path escapes the repository root"
    return candidate, None


def _digest_value(value: Any) -> str | None:
    """Return one normalized legacy SHA-256 value."""
    text = str(value)
    if text.startswith("sha256:"):
        text = text.removeprefix("sha256:")
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        return None
    return text


def _manual_artifact(path: str, reason: str, **extra: Any) -> dict[str, Any]:
    """Build one deterministic manual-review record."""
    return {"path": path, "disposition": "manual-review", "reason": reason, **extra}


def _load_legacy_manifest(root: Path) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Load and admit only the predecessor generated-files lock envelope."""
    lock_path, lock_error = _root_candidate(root, LEGACY_GENERATED_LOCK_PATH.as_posix())
    if lock_path is None:
        return None, [_manual_artifact(LEGACY_GENERATED_LOCK_PATH.as_posix(), str(lock_error))]
    if not lock_path.exists():
        return None, []
    if lock_path.is_symlink():
        return None, [_manual_artifact(
            LEGACY_GENERATED_LOCK_PATH.as_posix(), "legacy manifest is a symlink"
        )]
    try:
        manifest = _load_optional_mapping(lock_path)
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        return None, [_manual_artifact(
            LEGACY_GENERATED_LOCK_PATH.as_posix(),
            f"legacy manifest cannot be validated: {error.__class__.__name__}",
        )]
    if (
        not manifest
        or manifest.get("kind") != "governance-generated-files-lock"
        or manifest.get("version") != 1
        or not isinstance(manifest.get("files"), list)
    ):
        return None, [_manual_artifact(
            LEGACY_GENERATED_LOCK_PATH.as_posix(), "legacy manifest has an unsupported shape"
        )]
    return manifest, []


def _manifest_path_counts(entries: list[Any]) -> dict[str, int]:
    """Count normalized declared paths so duplicate evidence never authorizes pruning."""
    path_counts: dict[str, int] = {}
    for value in entries:
        relative = _safe_manifest_path(value.get("path")) if isinstance(value, dict) else None
        if relative is not None:
            path_counts[relative] = path_counts.get(relative, 0) + 1
    return path_counts


def _classify_legacy_artifact(
    root: Path, entry: Any, path_counts: dict[str, int]
) -> dict[str, Any]:
    """Classify one declared predecessor artifact from ownership and exact bytes."""
    if not isinstance(entry, dict):
        return _manual_artifact("<invalid-manifest-entry>", "entry is not a mapping")
    relative = _safe_manifest_path(entry.get("path"))
    ownership = str(entry.get("ownership", "unknown"))
    provenance = str(entry.get("provenance", "unknown"))
    if relative is None:
        return _manual_artifact(
            str(entry.get("path", "<missing>")),
            "manifest path is not a safe repository-relative path",
            ownership=ownership,
        )
    if path_counts.get(relative) != 1:
        return _manual_artifact(relative, "manifest path is duplicated", ownership=ownership)
    target, path_error = _root_candidate(root, relative)
    if target is None:
        return _manual_artifact(relative, str(path_error), ownership=ownership)
    if not target.exists() and not target.is_symlink():
        return {
            "path": relative, "disposition": "already-absent",
            "reason": "manifest path is already absent", "ownership": ownership,
        }
    if relative in CURRENT_RUNTIME_PATHS:
        return _manual_artifact(
            relative, "path remains part of the current thin runtime integration",
            ownership=ownership,
        )
    if ownership not in {"template-owned", "derived"}:
        return _manual_artifact(
            relative, "repository-owned or merge-owned artifacts are never auto-pruned",
            ownership=ownership,
        )
    expected = _digest_value(entry.get("accepted_target_sha256"))
    if provenance not in {"verified", "reconstructed-proven"} or expected is None:
        return _manual_artifact(
            relative, "runtime ownership or accepted hash is not proven by the legacy manifest",
            ownership=ownership, provenance=provenance,
        )
    if target.is_symlink() or not target.is_file():
        return _manual_artifact(
            relative, "declared artifact is not one regular file", ownership=ownership
        )
    actual = _sha256(target)
    if actual != expected:
        return _manual_artifact(
            relative, "artifact bytes differ from the prior accepted hash",
            ownership=ownership, expected_sha256=expected, actual_sha256=actual,
        )
    return {
        "path": relative, "disposition": "auto-prune",
        "reason": "runtime-owned regular file matches the prior accepted hash",
        "ownership": ownership, "sha256": actual,
    }


def _legacy_authority_records(root: Path, declared: set[str]) -> list[dict[str, Any]]:
    """Report predecessor authorities that cannot self-prove safe deletion."""
    records: list[dict[str, Any]] = []
    for authority_path in (LEGACY_INSTALL_RECEIPT_PATH, LEGACY_GENERATED_LOCK_PATH):
        authority, authority_error = _root_candidate(root, authority_path.as_posix())
        if authority is None:
            records.append(_manual_artifact(authority_path.as_posix(), str(authority_error)))
        elif authority.exists() and authority_path.as_posix() not in declared:
            records.append(_manual_artifact(
                authority_path.as_posix(),
                "legacy authority is not self-proven by the generated-file hash allowlist",
            ))
    return records


def _legacy_artifact_inventory(root: Path) -> list[dict[str, Any]]:
    """Classify only paths declared by the predecessor generated-files lock."""
    manifest, failures = _load_legacy_manifest(root)
    if manifest is None:
        return failures
    entries = manifest["files"]
    counts = _manifest_path_counts(entries)
    inventory = [_classify_legacy_artifact(root, entry, counts) for entry in entries]
    inventory.extend(_legacy_authority_records(root, set(counts)))

    return sorted(inventory, key=lambda value: (value["path"], value["disposition"]))


def _git_path_lines(root: Path, arguments: list[str]) -> list[str] | None:
    """Return exact-path Git output, or None when repository proof is unavailable."""
    result = subprocess.run(
        ["git", *arguments], cwd=root, text=True, capture_output=True, check=False
    )
    if result.returncode != 0:
        return None
    return [line for line in result.stdout.splitlines() if line]


def _runtime_purge_inventory(root: Path) -> list[dict[str, Any]]:
    """Classify fixed ignored runtime roots without scanning repository content."""
    inventory: list[dict[str, Any]] = []
    for relative_path in IGNORED_RUNTIME_PURGE_PATHS:
        relative = relative_path.as_posix()
        target, path_error = _root_candidate(root, relative)
        if target is None:
            inventory.append({
                "path": relative,
                "disposition": "manual-review",
                "reason": str(path_error),
            })
            continue
        if not target.exists() and not target.is_symlink():
            continue
        tracked = _git_path_lines(root, ["ls-files", "--", relative])
        ignored = subprocess.run(
            ["git", "check-ignore", "-q", "--", relative],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        ).returncode == 0
        eligible = tracked == [] and ignored and target.is_dir() and not target.is_symlink()
        inventory.append({
            "path": relative,
            "disposition": "runtime-purge" if eligible else "manual-review",
            "reason": (
                "post-validation purge candidate is ignored and contains no tracked paths; "
                "update does not remove it"
                if eligible
                else "runtime root is not proven ignored, untracked, and directory-owned"
            ),
        })
    return inventory


def _refresh_summary(cleanup: dict[str, Any]) -> None:
    """Keep cleanup counts aligned if apply-time proof changes a disposition."""
    artifacts = cleanup["previous_governance_artifacts"]
    runtime = cleanup["ignored_runtime_purge"]
    cleanup["summary"] = {
        "auto_prune": sum(item["disposition"] == "auto-prune" for item in artifacts),
        "manual_review": sum(
            item["disposition"] == "manual-review" for item in [*artifacts, *runtime]
        ),
        "runtime_purge": sum(item["disposition"] == "runtime-purge" for item in runtime),
    }


def build_upgrade_cleanup(root: Path) -> dict[str, Any]:
    """Build deterministic predecessor artifact cleanup disclosure."""
    result = {
        "previous_governance_artifacts": _legacy_artifact_inventory(root),
        "ignored_runtime_purge": _runtime_purge_inventory(root),
    }
    _refresh_summary(result)
    return result


def apply_upgrade_cleanup(root: Path, cleanup: dict[str, Any]) -> None:
    """Prune only re-proven predecessor files; never remove current runtime state."""
    for item in cleanup["previous_governance_artifacts"]:
        if item["disposition"] != "auto-prune":
            continue
        target, path_error = _root_candidate(root, item["path"])
        if (
            target is None
            or target.is_symlink()
            or not target.is_file()
            or _sha256(target) != item["sha256"]
        ):
            item.update({
                "disposition": "manual-review",
                "reason": path_error or "artifact changed before apply-time cleanup proof",
                "applied": False,
            })
            continue
        target.unlink()
        item["applied"] = True
    _refresh_summary(cleanup)
