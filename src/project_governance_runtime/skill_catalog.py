"""Resolve wheel-owned skills from the catalog and its declared pack manifests."""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path
from typing import Any

import yaml


RUNTIME_SKILL_ROOT = ".governance/runtime/skills/"
ACTIVATION_MODES = {"evaluation-only", "governed"}
ACTIVATION_LEVELS = {"required", "recommended", "available", "excluded"}


class SkillCatalogError(ValueError):
    """Report an unsafe, incomplete, or ambiguous packaged skill declaration."""


def package_skill_root() -> Path:
    """Return the installed package's canonical skill asset root."""
    return Path(str(files("project_governance_runtime").joinpath("assets", "skills")))


def runtime_relative(value: Any, *, owner: str) -> str:
    """Normalize one declared runtime path and keep it below the skill root."""
    if not isinstance(value, str) or not value.startswith(RUNTIME_SKILL_ROOT):
        raise SkillCatalogError(f"{owner}: path must start with {RUNTIME_SKILL_ROOT}")
    relative = Path(value.removeprefix(RUNTIME_SKILL_ROOT))
    if not relative.parts or relative.is_absolute() or ".." in relative.parts:
        raise SkillCatalogError(f"{owner}: path must stay inside the runtime skill root")
    return relative.as_posix()


def _mapping(path: Path, *, owner: str) -> dict[str, Any]:
    """Load one ordinary YAML mapping from the declared package tree."""
    if not path.is_file() or path.is_symlink():
        raise SkillCatalogError(f"{owner}: declared file is missing: {path}")
    value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(value, dict):
        raise SkillCatalogError(f"{owner}: expected a YAML mapping")
    return value


def _declared_file(asset_root: Path, value: Any, *, owner: str) -> tuple[str, Path]:
    """Resolve one declared ordinary file below the canonical asset root."""
    relative = runtime_relative(value, owner=owner)
    path = asset_root / relative
    if not path.is_file() or path.is_symlink():
        raise SkillCatalogError(f"{owner}: declared file is missing: {relative}")
    try:
        path.resolve().relative_to(asset_root.resolve())
    except ValueError as error:
        raise SkillCatalogError(f"{owner}: declared file resolves outside the asset root") from error
    return relative, path


def _frontmatter(path: Path, *, owner: str) -> dict[str, Any]:
    """Read portable YAML frontmatter without interpreting the instruction body."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise SkillCatalogError(f"{owner}: portable skill requires YAML frontmatter")
    closing = text.find("\n---\n", 4)
    if closing < 0:
        raise SkillCatalogError(f"{owner}: portable skill frontmatter is not closed")
    value = yaml.safe_load(text[4:closing]) or {}
    if not isinstance(value, dict):
        raise SkillCatalogError(f"{owner}: portable skill frontmatter must be a mapping")
    return value


def _references(asset_root: Path, entry: dict[str, Any], owner: str) -> list[str]:
    """Resolve manifest-owned progressive-disclosure files for one skill."""
    raw = entry.get("references", []) or []
    if not isinstance(raw, list):
        raise SkillCatalogError(f"{owner}.references: expected a list")
    result: list[str] = []
    for index, value in enumerate(raw):
        path_value = value.get("path") if isinstance(value, dict) else value
        relative, _ = _declared_file(
            asset_root, path_value, owner=f"{owner}.references[{index}]"
        )
        if relative in result:
            raise SkillCatalogError(f"{owner}.references: duplicate path {relative}")
        result.append(relative)
    return result


def _activation(entry: dict[str, Any], owner: str) -> tuple[str, str]:
    """Normalize current activation metadata while accepting unrelated legacy strings."""
    raw = entry.get("activation", {})
    if raw is None or isinstance(raw, str):
        value: dict[str, Any] = {}
    elif isinstance(raw, dict):
        value = raw
    else:
        raise SkillCatalogError(f"{owner}.activation: expected a mapping or legacy string")
    mode = value.get("mode", "governed")
    level = value.get("default_level", "available")
    if mode not in ACTIVATION_MODES:
        raise SkillCatalogError(f"{owner}.activation.mode: unsupported mode {mode}")
    if level not in ACTIVATION_LEVELS:
        raise SkillCatalogError(f"{owner}.activation.default_level: unsupported level {level}")
    return str(mode), str(level)


def _selector_metadata(entry: dict[str, Any], owner: str) -> tuple[dict[str, Any], list[str]]:
    """Validate the two shallow manifest fields consumed by the selector."""
    applicability = entry.get("applicability", {}) or {}
    if not isinstance(applicability, dict):
        raise SkillCatalogError(f"{owner}.applicability: expected a mapping")
    conflicts = entry.get("conflicts", []) or []
    if not isinstance(conflicts, list) or any(not isinstance(value, str) for value in conflicts):
        raise SkillCatalogError(f"{owner}.conflicts: expected a list of skill ids")
    return applicability, conflicts


def _validate_portable(path: Path, owner: str, skill_id: str) -> None:
    """Require provider-neutral name and description frontmatter for opted-in skills."""
    frontmatter = _frontmatter(path, owner=owner)
    if frontmatter.get("name") != skill_id:
        raise SkillCatalogError(
            f"{owner}: portable frontmatter name must equal skill id {skill_id}"
        )
    if not isinstance(frontmatter.get("description"), str) or not frontmatter["description"].strip():
        raise SkillCatalogError(f"{owner}: portable frontmatter description is required")


def _skill_record(
    asset_root: Path,
    entry: dict[str, Any],
    *,
    owner: str,
    pack_id: str | None,
) -> dict[str, Any]:
    """Normalize one catalog or manifest skill entry."""
    skill_id = entry.get("id")
    if not isinstance(skill_id, str) or not skill_id:
        raise SkillCatalogError(f"{owner}.id: non-empty string required")
    relative, path = _declared_file(asset_root, entry.get("path"), owner=f"{owner}.path")
    mode, level = _activation(entry, owner)
    applicability, conflicts = _selector_metadata(entry, owner)
    record = {
        "id": skill_id,
        "path": f"{RUNTIME_SKILL_ROOT}{relative}",
        "relative_path": relative,
        "package_path": path,
        "pack_id": pack_id,
        "activation_mode": mode,
        "default_level": level,
        "capability_owner": entry.get("capability_owner"),
        "applicability": applicability,
        "conflicts": conflicts,
        "references": _references(asset_root, entry, owner),
        "portable": entry.get("portable") is True,
        "router_for": [],
    }
    if record["portable"]:
        _validate_portable(path, owner, skill_id)
    return record


def _catalog_records(root: Path, catalog: dict[str, Any]) -> list[tuple[dict[str, Any], str]]:
    """Normalize the catalog's directly owned skills."""
    standard = catalog.get("standard_skills", []) or []
    if not isinstance(standard, list):
        raise SkillCatalogError("catalog.standard_skills: expected a list")
    records: list[tuple[dict[str, Any], str]] = []
    for position, entry in enumerate(standard):
        if not isinstance(entry, dict):
            raise SkillCatalogError(f"catalog.standard_skills[{position}]: expected a mapping")
        owner = f"catalog.standard_skills[{position}]"
        records.append((_skill_record(root, entry, owner=owner, pack_id=None), owner))
    return records


def _declared_packs(root: Path, catalog: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Load only manifests explicitly named by the package catalog."""
    packs: list[tuple[str, dict[str, Any]]] = []
    for section in ("stack_packs", "pattern_packs"):
        declarations = catalog.get(section, []) or []
        if not isinstance(declarations, list):
            raise SkillCatalogError(f"catalog.{section}: expected a list")
        for position, declaration in enumerate(declarations):
            if not isinstance(declaration, dict):
                raise SkillCatalogError(f"catalog.{section}[{position}]: expected a mapping")
            pack_id = declaration.get("id")
            if not isinstance(pack_id, str) or not pack_id:
                raise SkillCatalogError(f"catalog.{section}[{position}].id: non-empty string required")
            relative, manifest_path = _declared_file(
                root, declaration.get("manifest"), owner=f"catalog.{section}[{position}].manifest"
            )
            manifest = _mapping(manifest_path, owner=f"pack {pack_id}")
            if manifest.get("id") != pack_id:
                raise SkillCatalogError(f"pack {pack_id}: manifest id does not match catalog")
            manifest["_relative_path"] = relative
            packs.append((pack_id, manifest))
    return packs


def _pack_records(
    root: Path, packs: list[tuple[str, dict[str, Any]]]
) -> list[tuple[dict[str, Any], str]]:
    """Normalize included manifest-owned skills in declaration order."""
    records: list[tuple[dict[str, Any], str]] = []
    for pack_id, manifest in packs:
        entries = manifest.get("skills", []) or []
        if not isinstance(entries, list):
            raise SkillCatalogError(f"pack {pack_id}.skills: expected a list")
        for position, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise SkillCatalogError(f"pack {pack_id}.skills[{position}]: expected a mapping")
            if entry.get("status", "included") != "included":
                continue
            owner = f"pack {pack_id}.skills[{position}]"
            records.append((_skill_record(root, entry, owner=owner, pack_id=pack_id), owner))
    return records


def _register_record(
    index: dict[str, dict[str, Any]],
    path_owners: dict[str, str],
    capability_owners: dict[str, str],
    record: dict[str, Any],
    owner: str,
) -> None:
    """Enforce one skill, path, and capability owner while building the index."""
    skill_id = str(record["id"])
    relative = str(record["relative_path"])
    if skill_id in index:
        raise SkillCatalogError(f"{owner}: duplicate skill id {skill_id}")
    if relative in path_owners:
        raise SkillCatalogError(
            f"{owner}: skill path {relative} is already owned by {path_owners[relative]}"
        )
    capability = record.get("capability_owner")
    if capability and not isinstance(capability, str):
        raise SkillCatalogError(f"{owner}.capability_owner: expected a string")
    if capability and capability in capability_owners:
        raise SkillCatalogError(
            f"{owner}: capability {capability} is already owned by {capability_owners[capability]}"
        )
    if capability:
        capability_owners[capability] = skill_id
    index[skill_id] = record
    path_owners[relative] = skill_id


def _attach_pack_routers(
    index: dict[str, dict[str, Any]],
    path_owners: dict[str, str],
    packs: list[tuple[str, dict[str, Any]]],
) -> None:
    """Attach pack identities to an existing router owner without duplicating it."""
    for pack_id, manifest in packs:
        router_value = manifest.get("router_skill")
        if router_value is None:
            continue
        relative = runtime_relative(router_value, owner=f"pack {pack_id}.router_skill")
        router_id = path_owners.get(relative)
        if router_id is None:
            raise SkillCatalogError(
                f"pack {pack_id}.router_skill: path has no catalog or manifest skill owner"
            )
        index[router_id]["router_for"].append(pack_id)


def build_skill_index(asset_root: Path | None = None) -> dict[str, dict[str, Any]]:
    """Index declared skills without scanning beyond catalog-owned manifests."""
    root = asset_root or package_skill_root()
    catalog = _mapping(root / "catalog.yaml", owner="catalog")
    packs = _declared_packs(root, catalog)
    index: dict[str, dict[str, Any]] = {}
    path_owners: dict[str, str] = {}
    capability_owners: dict[str, str] = {}
    records = [*_catalog_records(root, catalog), *_pack_records(root, packs)]
    for record, owner in records:
        _register_record(index, path_owners, capability_owners, record, owner)
    _attach_pack_routers(index, path_owners, packs)
    return index


def canonical_skill_bytes(record: dict[str, Any]) -> bytes:
    """Read exact canonical bytes for one indexed package-owned skill."""
    path = record.get("package_path")
    if not isinstance(path, Path) or not path.is_file() or path.is_symlink():
        raise SkillCatalogError(f"skill {record.get('id')}: canonical package file is unavailable")
    return path.read_bytes()
