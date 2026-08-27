"""Load built-in and repository-owned validation configuration.

The package owns generic packs. A repository may explicitly replace one built-in concern with one
target-owned pack; silent replacement and duplicate ownership remain invalid.
"""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path
from typing import Any, Iterable

import yaml


ENFORCEMENT_STRENGTH = {"advisory": 0, "blocking": 1}
KNOWN_ENFORCEMENTS = set(ENFORCEMENT_STRENGTH)


class ConfigurationError(ValueError):
    """Report one invalid or ambiguous runtime configuration input."""


def load_yaml(path: Path) -> dict[str, Any]:
    """Load one YAML mapping and fail with its exact path."""
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as error:
        detail = getattr(error, "problem", None) or str(error)
        raise ConfigurationError(f"{path}: invalid YAML: {detail}") from error
    if not isinstance(value, dict):
        raise ConfigurationError(f"{path}: expected a YAML mapping")
    return value


def _builtin_documents() -> Iterable[tuple[str, dict[str, Any]]]:
    """Yield generic pack documents embedded in the installed wheel."""
    pack_root = files("project_governance_runtime").joinpath("packs")
    for resource in sorted(pack_root.iterdir(), key=lambda item: item.name):
        if not resource.name.endswith(".yaml"):
            continue
        value = yaml.safe_load(resource.read_text(encoding="utf-8")) or {}
        if not isinstance(value, dict):
            raise ConfigurationError(f"built-in pack {resource.name}: expected a mapping")
        yield f"wheel:{resource.name}", value


def _target_documents(root: Path) -> Iterable[tuple[str, dict[str, Any]]]:
    """Yield only the target-owned pack manifests retained by a child repository."""
    pack_root = root / "config/validation/packs"
    if not pack_root.exists():
        return
    for path in sorted(pack_root.glob("*.yaml")):
        yield path.relative_to(root).as_posix(), load_yaml(path)


def _validate_pack(source: str, pack: dict[str, Any]) -> str:
    """Validate the small manifest surface required by planning and execution."""
    pack_id = str(pack.get("id", "")).strip()
    if not pack_id:
        raise ConfigurationError(f"{source}: id is required")
    if pack.get("enforcement") not in KNOWN_ENFORCEMENTS:
        raise ConfigurationError(f"{source}: enforcement must be advisory or blocking")
    if not isinstance(pack.get("commands"), list) or not pack["commands"]:
        raise ConfigurationError(f"{source}: commands must be a non-empty list")
    if not isinstance(pack.get("path_globs", []), list):
        raise ConfigurationError(f"{source}: path_globs must be a list")
    if not isinstance(pack.get("stages", []), list):
        raise ConfigurationError(f"{source}: stages must be a list")
    if not isinstance(pack.get("depends_on", []), list):
        raise ConfigurationError(f"{source}: depends_on must be a list")
    replacements = pack.get("replaces_builtin_packs", [])
    if not isinstance(replacements, list) or any(
        not isinstance(value, str) or not value.strip() for value in replacements
    ):
        raise ConfigurationError(f"{source}: replaces_builtin_packs must be a string list")
    normalized = [value.strip() for value in replacements]
    if len(normalized) != len(set(normalized)):
        raise ConfigurationError(f"{source}: replaces_builtin_packs contains duplicates")
    pack["replaces_builtin_packs"] = normalized
    if "change_packet_contract" in pack and pack["change_packet_contract"] != 1:
        raise ConfigurationError(f"{source}: change_packet_contract must be 1")
    return pack_id


def _claim_replacement(
    packs: dict[str, dict[str, Any]],
    claims: dict[str, str],
    pack_id: str,
    built_in_id: str,
) -> None:
    """Validate one ownership transfer before recording its effective owner."""
    if built_in_id == pack_id:
        raise ConfigurationError(f"pack {pack_id}: a pack cannot replace itself")
    if built_in_id not in packs or packs[built_in_id].get("_origin") != "builtin":
        raise ConfigurationError(
            f"pack {pack_id}: replacement names unknown built-in {built_in_id}"
        )
    built_in = packs[built_in_id]
    if str(built_in.get("impact_role", "owner")) == "supplemental":
        raise ConfigurationError(
            f"pack {pack_id}: supplemental built-in {built_in_id} cannot be replaced"
        )
    pack = packs[pack_id]
    if (
        ENFORCEMENT_STRENGTH[str(pack["enforcement"])]
        < ENFORCEMENT_STRENGTH[str(built_in["enforcement"])]
    ):
        raise ConfigurationError(
            f"pack {pack_id}: {pack['enforcement']} enforcement cannot replace "
            f"{built_in['enforcement']} built-in {built_in_id}"
        )
    if built_in_id in claims:
        raise ConfigurationError(
            f"built-in {built_in_id} has duplicate replacers {claims[built_in_id]} and {pack_id}"
        )
    missing_stages = sorted(
        set(str(value) for value in built_in.get("stages", []))
        - set(str(value) for value in pack.get("stages", []))
    )
    if missing_stages:
        raise ConfigurationError(
            f"pack {pack_id}: replacement of {built_in_id} misses stages {', '.join(missing_stages)}"
        )
    claims[built_in_id] = pack_id


def _replacement_claims(packs: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Validate explicit target ownership and return built-in-to-target claims."""
    claims: dict[str, str] = {}
    for pack_id, pack in packs.items():
        replacements = list(pack.get("replaces_builtin_packs", []))
        if not replacements:
            continue
        if pack.get("_origin") != "target" or pack.get("implementation_status", "active") != "active":
            raise ConfigurationError(f"pack {pack_id}: only an active target pack may replace built-ins")
        if pack.get("change_packet_contract") != 1:
            raise ConfigurationError(
                f"pack {pack_id}: replacement requires change_packet_contract: 1"
            )
        for built_in_id in replacements:
            _claim_replacement(packs, claims, pack_id, built_in_id)
    return claims


def _validate_replacement_dependencies(
    packs: dict[str, dict[str, Any]], claims: dict[str, str]
) -> None:
    """Require dependencies to name the effective owner instead of reviving a built-in."""
    for pack_id, pack in packs.items():
        for dependency in pack.get("depends_on", []):
            if dependency in claims:
                raise ConfigurationError(
                    f"pack {pack_id}: dependency {dependency} is replaced by {claims[dependency]}; "
                    "depend on the target owner explicitly"
                )


def load_packs(root: Path) -> dict[str, dict[str, Any]]:
    """Merge wheel-owned generic packs with child-owned extension packs."""
    packs: dict[str, dict[str, Any]] = {}
    documents = [
        *((source, value, "builtin") for source, value in _builtin_documents()),
        *((source, value, "target") for source, value in _target_documents(root)),
    ]
    for source, value, origin in documents:
        pack_id = _validate_pack(source, value)
        if pack_id in packs:
            raise ConfigurationError(
                f"{source}: duplicate pack id {pack_id}; target packs cannot replace built-ins"
            )
        packs[pack_id] = {**value, "_source": source, "_origin": origin}
    claims = _replacement_claims(packs)
    _validate_replacement_dependencies(packs, claims)
    return packs
