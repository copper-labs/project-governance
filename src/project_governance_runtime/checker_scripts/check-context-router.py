#!/usr/bin/env python3
"""Validate optional direct context-router configuration with normalized findings."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import yaml

from context_check_profile import router_is_configured, validate_router


ROOT = Path.cwd()
PROFILE_PATH = ROOT / "config/governance/profile.yaml"
FACTS_LOCK_PATH = ROOT / "config/governance/facts.lock.yaml"


class UniqueKeyLoader(yaml.SafeLoader):
    """Load YAML mappings while rejecting duplicate keys that hide configuration errors."""


def construct_unique_mapping(loader: UniqueKeyLoader, node: yaml.nodes.MappingNode, deep: bool = False) -> dict[Any, Any]:
    """Construct one mapping without allowing later keys to silently replace earlier ones."""
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping", node.start_mark, f"found duplicate key ({key})", key_node.start_mark
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_unique_mapping)


def load_mapping(path: Path, errors: list[str], *, required: bool) -> dict[str, Any]:
    """Load one ordinary YAML mapping, returning no configuration when it is optional."""
    if not path.is_file() or path.is_symlink():
        if required:
            errors.append(f"{path.relative_to(ROOT)}: required ordinary YAML file is missing")
        return {}
    try:
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueKeyLoader) or {}
    except yaml.YAMLError as error:
        errors.append(f"{path.relative_to(ROOT)}: invalid YAML: {error}")
        return {}
    if not isinstance(value, dict):
        errors.append(f"{path.relative_to(ROOT)}: expected a YAML mapping")
        return {}
    return value


def emit_result(errors: list[str]) -> None:
    """Write the shared checker-result envelope once at the process boundary."""
    print(json.dumps({"status": "failed" if errors else "passed", "finding_count": len(errors), "findings": errors}, sort_keys=True))


def main() -> int:
    """Check optional routing only when the child deliberately configured it."""
    errors: list[str] = []
    profile = load_mapping(PROFILE_PATH, errors, required=False)
    if router_is_configured(profile):
        facts = load_mapping(FACTS_LOCK_PATH, errors, required=True)
        if not errors:
            validate_router(ROOT, profile, facts, errors)
    emit_result(errors)
    if errors:
        for error in errors:
            print(f"context-router: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
