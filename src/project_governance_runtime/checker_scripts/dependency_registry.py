"""Bind npm artifacts and release evidence to explicitly trusted scope registries."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote, urlparse

PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org"


def registry_policy_errors(value: Any) -> list[str]:
    """Reject ambiguous trust configuration before dependency evaluation can use it."""
    if not isinstance(value, dict):
        return ["npm_registries must map exact npm scopes to HTTPS registry base URLs"]
    errors = []
    for scope, base in value.items():
        if not isinstance(scope, str) or not re.fullmatch(r"@[a-z0-9][a-z0-9._-]*", scope):
            errors.append("npm_registries keys must be exact lowercase npm scopes")
        if not safe_registry_base(base):
            errors.append(f"npm_registries[{scope!r}] must be an unambiguous HTTPS registry base URL")
    return errors


def safe_registry_base(value: Any) -> bool:
    """Keep registry trust free of credentials, URL rewriting, and path traversal."""
    if not isinstance(value, str) or re.search(r"[\s\\%?#]", value):
        return False
    try:
        parsed = urlparse(value)
        if (
            parsed.scheme != "https" or not parsed.hostname or parsed.netloc != parsed.hostname
            or parsed.username or parsed.password or parsed.params
            or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", parsed.hostname)
        ):
            return False
        path = parsed.path.removesuffix("/")
        return not path or all(segment not in {".", "..", ""} for segment in path[1:].split("/"))
    except ValueError:
        return False


def npm_registry_base(name: str, registries: dict[str, str] | None = None) -> str:
    """Choose one registry per scope; unconfigured packages retain public npm trust."""
    scope = name.split("/", 1)[0] if name.startswith("@") else ""
    return (registries or {}).get(scope, PUBLIC_NPM_REGISTRY).rstrip("/")


def npm_url_matches(name: str, suffix: str, value: Any, registries: dict[str, str] | None = None, *, allow_trailing_slash: bool = False) -> bool:
    """Compare the complete origin and decoded package path without prefix allowances."""
    if not isinstance(value, str) or re.search(r"[\s\\?#]", value):
        return False
    try:
        parsed = urlparse(value)
        base = urlparse(npm_registry_base(name, registries))
        source_path = unquote(parsed.path)
        if allow_trailing_slash:
            source_path = source_path.rstrip("/")
        return (
            parsed.scheme == "https" and parsed.netloc == base.netloc
            and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment and not parsed.params
            and source_path == f"{base.path}/{name}{suffix}"
        )
    except ValueError:
        return False


def npm_config_registry_matches(scope: str, value: Any, registries: dict[str, str] | None = None) -> bool:
    """Limit package-manager registry configuration to the same exact scope binding."""
    return safe_registry_base(value) and value.rstrip("/") == npm_registry_base(scope, registries)
