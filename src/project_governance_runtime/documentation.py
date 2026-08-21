"""Install and route one minimal repository-owned developer documentation corpus."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml

from .installation import PROFILE_DEFAULT_TEXT
from .state_io import atomic_write_text


PROFILE_PATH = Path("config/governance/profile.yaml")
DEFAULT_ROOT = "docs/developer"
LIST_FIELDS = ("aliases", "tasks", "symbols", "guides", "sources")


class DocumentationError(ValueError):
    """Report one invalid documentation profile, catalog, route, or install target."""


def _load_mapping(path: Path, label: str) -> dict[str, Any]:
    """Load one YAML mapping with a path-specific error."""
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as error:
        raise DocumentationError(f"{label}: invalid YAML: {error}") from error
    if not isinstance(value, dict):
        raise DocumentationError(f"{label}: expected a YAML mapping")
    return value


def _repository_path(
    root: Path, value: str, label: str, *, reject_symlinks: bool = False
) -> Path:
    """Resolve one nonempty relative path inside the repository."""
    path = Path(value)
    if not value.strip() or path.is_absolute() or ".." in path.parts:
        raise DocumentationError(f"{label}: must be a repository-relative path")
    repository = root.resolve()
    candidate = repository / path
    if reject_symlinks:
        current = repository
        for part in path.parts:
            current /= part
            if current.is_symlink():
                raise DocumentationError(f"{label}: symlinks are not allowed")
    resolved = candidate.resolve()
    try:
        resolved.relative_to(repository)
    except ValueError as error:
        raise DocumentationError(f"{label}: path escapes the repository") from error
    return resolved


def load_documentation_config(root: Path) -> dict[str, Any] | None:
    """Load and validate the optional documentation section from the existing profile."""
    root = root.resolve()
    profile_path = root / PROFILE_PATH
    if not profile_path.exists() and not profile_path.is_symlink():
        return None
    if profile_path.is_symlink() or not profile_path.is_file():
        raise DocumentationError(f"{PROFILE_PATH.as_posix()}: must be a regular file")
    profile = _load_mapping(profile_path, PROFILE_PATH.as_posix())
    value = profile.get("documentation")
    if value is None:
        return None
    if not isinstance(value, dict):
        raise DocumentationError("profile documentation must be a mapping")
    enabled = value.get("enabled", True)
    if not isinstance(enabled, bool):
        raise DocumentationError("profile documentation.enabled must be true or false")
    documentation_root = value.get("root", DEFAULT_ROOT)
    if not isinstance(documentation_root, str):
        raise DocumentationError("profile documentation.root must be a string")
    resolved_root = _repository_path(
        root,
        documentation_root,
        "profile documentation.root",
        reject_symlinks=True,
    )
    if resolved_root == root.resolve():
        raise DocumentationError("profile documentation.root must not be the repository root")
    research = value.get("research", "allowed")
    if research not in {"allowed", "disabled"}:
        raise DocumentationError(
            "profile documentation.research must be allowed or disabled"
        )
    return {
        "enabled": enabled,
        "root": resolved_root.relative_to(root.resolve()).as_posix(),
        "research": research,
    }


def _default_profile_text() -> str:
    """Return the ordinary profile with the optional documentation module enabled."""
    return PROFILE_DEFAULT_TEXT + (
        "documentation:\n"
        "  enabled: true\n"
        f"  root: {DEFAULT_ROOT}\n"
        "  research: allowed\n"
    )


def _append_documentation_section(text: str) -> str:
    """Append the new section without reformatting repository-owned profile text."""
    separator = "" if not text or text.endswith("\n") else "\n"
    return (
        f"{text}{separator}documentation:\n"
        "  enabled: true\n"
        f"  root: {DEFAULT_ROOT}\n"
        "  research: allowed\n"
    )


def _index_text(today: str) -> str:
    """Return one neutral human and agent entry page without product claims."""
    return f"""---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: repository
created: {today}
updated: {today}
summary: Routes developers and agents to the repository's canonical technical documentation.
---

# Developer Documentation

Start with the reader job you need to complete. Add a guide only when it provides a tested journey;
keep exact behavior in one canonical reference.

## For Humans

The capability catalog begins empty. As capabilities are documented, link their shortest useful
guides here by reader job.

## For Agents

Read `catalog.yaml`, then use the matched capability's reference, guides, and local sources. When the
installed runtime is available, `project-governance docs route` returns the same bounded context.
"""


def _catalog_text() -> str:
    """Return one honest empty capability catalog."""
    return "version: 1\ncapabilities: []\n"


def _preflight_target(path: Path, *, directory: bool) -> str:
    """Classify an expected path without mutating it."""
    if not path.exists() and not path.is_symlink():
        return "created"
    if path.is_symlink():
        return "conflict"
    if directory and path.is_dir():
        return "unchanged"
    if not directory and path.is_file():
        return "unchanged"
    return "conflict"


def _profile_install_plan(
    root: Path,
) -> tuple[dict[str, Any], str | None, bool, bool]:
    """Resolve existing configuration and any text needed to enable the module."""
    profile_path = root / PROFILE_PATH
    if profile_path.exists() or profile_path.is_symlink():
        if profile_path.is_symlink() or not profile_path.is_file():
            raise DocumentationError(f"{PROFILE_PATH.as_posix()}: must be a regular file")
        existing_text = profile_path.read_text(encoding="utf-8")
        profile = _load_mapping(profile_path, PROFILE_PATH.as_posix())
        if "documentation" not in profile:
            config = {"enabled": True, "root": DEFAULT_ROOT, "research": "allowed"}
            return config, _append_documentation_section(existing_text), False, True
        config = load_documentation_config(root)
        if config is None:
            raise DocumentationError("profile documentation configuration is unavailable")
        return config, None, False, False
    config = {"enabled": True, "root": DEFAULT_ROOT, "research": "allowed"}
    return config, _default_profile_text(), True, False


def _target_plan(root: Path, documentation_root: Path) -> tuple[list[str], list[str], list[str]]:
    """Classify the four minimal module paths without mutating them."""
    if documentation_root.is_symlink() or (
        documentation_root.exists() and not documentation_root.is_dir()
    ):
        return [], [], [documentation_root.relative_to(root).as_posix()]
    paths = {
        documentation_root / "index.md": False,
        documentation_root / "catalog.yaml": False,
        documentation_root / "guides": True,
        documentation_root / "reference": True,
    }
    states: dict[str, list[str]] = {"created": [], "unchanged": [], "conflict": []}
    for path, directory in paths.items():
        state = _preflight_target(path, directory=directory)
        states[state].append(path.relative_to(root).as_posix())
    return states["created"], states["unchanged"], states["conflict"]


def _write_documentation_structure(
    root: Path, documentation_root: Path, profile_text: str | None
) -> None:
    """Apply one conflict-free create-only installation plan."""
    documentation_root.mkdir(parents=True, exist_ok=True)
    for directory in (documentation_root / "guides", documentation_root / "reference"):
        directory.mkdir(exist_ok=True)
    contents = {
        documentation_root / "index.md": _index_text(date.today().isoformat()),
        documentation_root / "catalog.yaml": _catalog_text(),
    }
    for path, content in contents.items():
        if not path.exists():
            with path.open("x", encoding="utf-8") as stream:
                stream.write(content)
    if profile_text is not None:
        profile_path = root / PROFILE_PATH
        profile_path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(profile_path, profile_text)


def initialize_documentation(root: Path, *, dry_run: bool = False) -> dict[str, Any]:
    """Install the minimal structure once while preserving repository-owned content."""
    root = root.resolve()
    config, profile_text, profile_created, profile_updated = _profile_install_plan(root)

    if not config["enabled"]:
        return {
            "kind": "project-governance-documentation-init",
            "version": 1,
            "status": "disabled",
            "dry_run": dry_run,
            "created": [],
            "updated": [],
            "unchanged": [PROFILE_PATH.as_posix()],
            "conflicts": [],
            "agent_pointer": None,
            "research": config["research"],
        }

    documentation_root = _repository_path(
        root, str(config["root"]), "profile documentation.root"
    )
    created, unchanged, conflicts = _target_plan(root, documentation_root)
    if profile_created:
        created.insert(0, PROFILE_PATH.as_posix())
    elif not profile_updated:
        unchanged.insert(0, PROFILE_PATH.as_posix())

    updated = [PROFILE_PATH.as_posix()] if profile_updated else []
    status = "failed" if conflicts else ("dry-run" if dry_run else "initialized")
    if not conflicts and not dry_run and not created and not updated:
        status = "unchanged"
    result = {
        "kind": "project-governance-documentation-init",
        "version": 1,
        "status": status,
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "conflicts": conflicts,
        "agent_pointer": (
            f"Developer documentation: `{config['root']}/index.md`; "
            f"agent catalog: `{config['root']}/catalog.yaml`; "
            f"external research: `{config['research']}`."
        ),
        "research": config["research"],
    }
    if conflicts or dry_run:
        return result
    _write_documentation_structure(root, documentation_root, profile_text)
    return result


def _catalog_path(root: Path, config: dict[str, Any]) -> Path:
    """Return the configured catalog path inside the repository."""
    return _repository_path(
        root,
        f"{config['root']}/catalog.yaml",
        "documentation catalog",
        reject_symlinks=True,
    )


def _string_list(record: dict[str, Any], field: str, label: str) -> list[str]:
    """Normalize one optional catalog string list."""
    values = record.get(field, [])
    if not isinstance(values, list) or any(
        not isinstance(item, str) or not item.strip() for item in values
    ):
        raise DocumentationError(f"{label}.{field} must be a string list")
    return [item.strip() for item in values]


def _require_local_file(root: Path, value: str, label: str) -> None:
    """Require one catalog route or source to remain inside the repository and exist."""
    target = _repository_path(root, value, label)
    if not target.is_file():
        raise DocumentationError(f"{label}: target is missing: {value}")


def _normalize_capability(
    root: Path,
    record: Any,
    *,
    index: int,
    catalog_label: str,
    validate_paths: bool,
) -> dict[str, Any]:
    """Normalize one minimal capability while retaining project-owned extension keys."""
    label = f"{catalog_label}: capabilities[{index}]"
    if not isinstance(record, dict):
        raise DocumentationError(f"{label} must be a mapping")
    normalized = dict(record)
    for field in ("id", "title", "reference"):
        if not isinstance(record.get(field), str) or not record[field].strip():
            raise DocumentationError(f"{label}.{field} must be a non-empty string")
        normalized[field] = record[field].strip()
    for field in LIST_FIELDS:
        normalized[field] = _string_list(record, field, label)
    if validate_paths:
        _require_local_file(root, normalized["reference"], f"{label}.reference")
        for field in ("guides", "sources"):
            for value in normalized[field]:
                _require_local_file(root, value, f"{label}.{field}")
    return normalized


def load_catalog(
    root: Path, config: dict[str, Any], *, validate_paths: bool = True
) -> list[dict[str, Any]]:
    """Load structurally valid capability records and their contained local paths."""
    root = root.resolve()
    path = _catalog_path(root, config)
    if not path.is_file():
        raise DocumentationError(f"{path.relative_to(root).as_posix()}: catalog is missing")
    value = _load_mapping(path, path.relative_to(root).as_posix())
    if value.get("version") != 1:
        raise DocumentationError(f"{path.relative_to(root).as_posix()}: version must be 1")
    capabilities = value.get("capabilities")
    if not isinstance(capabilities, list):
        raise DocumentationError(
            f"{path.relative_to(root).as_posix()}: capabilities must be a list"
        )
    catalog_label = path.relative_to(root).as_posix()
    return [
        _normalize_capability(
            root,
            record,
            index=index,
            catalog_label=catalog_label,
            validate_paths=validate_paths,
        )
        for index, record in enumerate(capabilities)
    ]


def documentation_selection_paths(root: Path) -> list[str]:
    """Return configured corpus and declared evidence paths owned by the existing pack."""
    paths = {PROFILE_PATH.as_posix()}
    try:
        config = load_documentation_config(root)
        if config is None or not config["enabled"]:
            return sorted(paths)
        paths.add(f"{config['root']}/**")
        for record in load_catalog(root, config, validate_paths=False):
            paths.update(
                [record["reference"], *record["guides"], *record["sources"]]
            )
    except (DocumentationError, OSError, UnicodeError):
        pass
    return sorted(paths)


def documentation_issues(root: Path) -> list[str]:
    """Return deterministic enabled-module defects for the existing documentation checker."""
    root = root.resolve()
    issues: list[str] = []
    try:
        config = load_documentation_config(root)
        if config is None or not config["enabled"]:
            return []
        documentation_root = _repository_path(
            root, str(config["root"]), "profile documentation.root"
        )
        index = documentation_root / "index.md"
        if not index.is_file() or index.is_symlink():
            issues.append(f"{index.relative_to(root).as_posix()}: human entry point is missing")
        records = load_catalog(root, config)
    except (DocumentationError, OSError, UnicodeError) as error:
        return sorted(set([*issues, str(error)]))

    capability_routes: dict[str, str] = {}
    symbol_routes: dict[str, str] = {}
    for record in records:
        capability_id = record["id"]
        for route in [capability_id, *record["aliases"]]:
            if route in capability_routes:
                issues.append(
                    f"documentation catalog: exact capability route {route!r} is owned by "
                    f"both {capability_routes[route]!r} and {capability_id!r}"
                )
            else:
                capability_routes[route] = capability_id
        for symbol in record["symbols"]:
            if symbol in symbol_routes:
                issues.append(
                    f"documentation catalog: exact symbol route {symbol!r} is owned by "
                    f"both {symbol_routes[symbol]!r} and {capability_id!r}"
                )
            else:
                symbol_routes[symbol] = capability_id
    return sorted(set(issues))


def route_documentation(
    root: Path, *, capability: str | None = None, symbol: str | None = None
) -> dict[str, Any]:
    """Resolve one exact capability or symbol without fuzzy matching or corpus loading."""
    root = root.resolve()
    query_kind = "capability" if capability is not None else "symbol"
    query = capability if capability is not None else symbol
    envelope: dict[str, Any] = {
        "kind": "project-governance-documentation-route",
        "version": 1,
        "query_kind": query_kind,
    }
    try:
        config = load_documentation_config(root)
        if config is None:
            return {**envelope, "status": "disabled", "match_count": 0}
        envelope["research"] = config["research"]
        if not config["enabled"]:
            return {**envelope, "status": "disabled", "match_count": 0}
        records = load_catalog(root, config, validate_paths=False)
    except (DocumentationError, OSError, UnicodeError) as error:
        return {**envelope, "status": "invalid", "match_count": 0, "error": str(error)}

    if query_kind == "capability":
        matches = [
            record
            for record in records
            if query == record["id"] or query in record["aliases"]
        ]
    else:
        matches = [record for record in records if query in record["symbols"]]
    if not matches:
        return {**envelope, "status": "not-found", "match_count": 0}
    if len(matches) > 1:
        return {**envelope, "status": "ambiguous", "match_count": len(matches)}

    record = matches[0]
    context: list[str] = []
    for path in [record["reference"], *record["guides"], *record["sources"]]:
        if path not in context:
            context.append(path)
    return {
        **envelope,
        "status": "matched",
        "match_count": 1,
        "capability": record,
        "context_paths": context,
    }
