"""Extract dependency coordinates from supported governed source formats."""

from __future__ import annotations

import base64
import fnmatch
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import yaml

from dependency_primitives import (
    ACTION_SHA,
    CANONICAL_MAVEN_REPOSITORIES,
    CANONICAL_NPM_REGISTRY,
    MAVEN_ID,
    MAVEN_VERSION,
    NPM_EXACT,
    NPM_NAME,
    REQUIREMENT,
    UnsupportedDependencyFormat,
    dependency,
)

def parse_requirements(path: Path) -> list[dict[str, str]]:
    """Extract exact direct Python requirements from one requirements file."""
    values: list[dict[str, str]] = []
    logical = ""
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        logical = f"{logical} {stripped}".strip()
        if logical.endswith("\\"):
            logical = logical[:-1].rstrip()
            continue
        logical = re.sub(r"(?:\s+--hash=sha256:[0-9a-fA-F]{64})+$", "", logical)
        match = REQUIREMENT.fullmatch(logical)
        if not match or "*" in match.group("version"):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}:{number}: requirement must use an exact name==version pin")
        values.append(dependency(match.group("name").split("[", 1)[0], "pypi", match.group("version"), "direct"))
        logical = ""
    if logical:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: incomplete continued requirement")
    return values
def exact_npm_version(path: Path, name: str, value: Any) -> str:
    """Require one exact npm version without ranges or alternate sources."""
    version = str(value or "")
    if not NPM_EXACT.fullmatch(version):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: npm dependency {name!r} must use an exact major.minor.patch registry version")
    return version
def exact_npm_name(path: Path, value: Any, field: str) -> str:
    """Validate one npm package name from a manifest field."""
    name = str(value or "")
    if not NPM_NAME.fullmatch(name):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {field} key {name!r} must be an exact npm package name without selectors or globs")
    return name
def parse_npm_overrides(path: Path, raw: Any, field: str, artifact_type: str = "override") -> list[dict[str, str]]:
    """Extract exact npm override or resolution coordinates."""
    if raw is None:
        return []
    if not isinstance(raw, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {field} must be an object")
    values: list[dict[str, str]] = []
    for raw_name, raw_version in sorted(raw.items()):
        name = exact_npm_name(path, raw_name, field)
        if not isinstance(raw_version, str):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: {field}.{name} nested or reference syntax is unsupported; add a deterministic parser")
        values.append(dependency(name, "npm", exact_npm_version(path, name, raw_version), artifact_type))
    return values
def parse_package_json(path: Path) -> list[dict[str, str]]:
    """Extract exact dependency coordinates from package.json."""
    values, defects = parse_package_json_npm_entries(path)
    if defects:
        raise UnsupportedDependencyFormat(str(defects[0]["message"]))
    return values


def npm_literal(value: Any) -> str:
    """Serialize one offending npm value into a content-stable defect identity."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def npm_defect(kind: str, name: str, field: str, value: Any, message: str) -> dict[str, Any]:
    """Describe one ratchetable npm entry defect without using its lock-entry path."""
    literal = npm_literal(value)
    identity = (kind, field, name, literal) if kind == "manifest" else (kind, name, field, literal)
    repair_key = (kind, field, name) if kind == "manifest" else (kind, name)
    return {
        "identity": identity,
        "repair_key": repair_key,
        "message": message,
    }


def append_npm_manifest_entries(
    path: Path,
    raw: Any,
    field: str,
    artifact_type: str,
    values: list[dict[str, str]],
    defects: list[dict[str, Any]],
) -> None:
    """Collect one manifest coordinate map while retaining entry-local defects."""
    if raw is None:
        return
    if not isinstance(raw, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {field} must be an object")
    for raw_name, raw_version in sorted(raw.items()):
        name = str(raw_name)
        if not NPM_NAME.fullmatch(name):
            defects.append(npm_defect(
                "manifest",
                name,
                field,
                raw_version,
                f"{path.as_posix()}: {field} key {name!r} must be an exact npm package name without selectors or globs",
            ))
            continue
        if not isinstance(raw_version, str) or not NPM_EXACT.fullmatch(raw_version):
            defects.append(npm_defect(
                "manifest",
                name,
                field,
                raw_version,
                f"{path.as_posix()}: npm dependency {name!r} must use an exact major.minor.patch registry version",
            ))
            continue
        values.append(dependency(name, "npm", raw_version, artifact_type))


def parse_package_json_npm_entries(path: Path) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Extract manifest coordinates while retaining independently repairable npm defects."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid package.json: {exc}") from exc
    if not isinstance(document, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: package.json must contain an object")
    values: list[dict[str, str]] = []
    defects: list[dict[str, Any]] = []
    groups = {"dependencies": "direct", "devDependencies": "development", "optionalDependencies": "optional", "peerDependencies": "peer"}
    for group, artifact_type in groups.items():
        append_npm_manifest_entries(path, document.get(group, {}), group, artifact_type, values, defects)
    append_npm_manifest_entries(path, document.get("overrides"), "overrides", "override", values, defects)
    append_npm_manifest_entries(path, document.get("resolutions"), "resolutions", "override", values, defects)
    pnpm = document.get("pnpm")
    if pnpm is not None:
        if not isinstance(pnpm, dict):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: pnpm must be an object")
        append_npm_manifest_entries(path, pnpm.get("overrides"), "pnpm.overrides", "override", values, defects)
        unsupported = {"packageExtensions", "patchedDependencies"} & set(pnpm)
        if unsupported:
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: unsupported dependency-bearing pnpm fields: {', '.join(sorted(unsupported))}")
    package_manager = document.get("packageManager")
    if package_manager is not None:
        match = re.fullmatch(r"(?P<name>[A-Za-z0-9._-]+)@(?P<version>.+)", str(package_manager))
        name = match.group("name") if match else "<packageManager>"
        version = match.group("version") if match else None
        if match is None or not NPM_EXACT.fullmatch(str(version or "")):
            defects.append(npm_defect(
                "manifest",
                name,
                "packageManager",
                package_manager,
                f"{path.as_posix()}: packageManager must use an exact manager@version pin",
            ))
        else:
            values.append(dependency(name, "npm", str(version), "toolchain"))
    return values, defects
def parse_pnpm_workspace(path: Path) -> list[dict[str, str]]:
    """Extract exact catalog coordinates from a pnpm workspace file."""
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid pnpm workspace YAML: {exc}") from exc
    if not isinstance(document, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: pnpm workspace must contain a mapping")
    values = parse_npm_overrides(path, document.get("catalog"), "catalog", "catalog")
    catalogs = document.get("catalogs")
    if catalogs is not None:
        if not isinstance(catalogs, dict):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: catalogs must be an object")
        for catalog_name, entries in sorted(catalogs.items()):
            if not isinstance(catalog_name, str) or not catalog_name:
                raise UnsupportedDependencyFormat(f"{path.as_posix()}: catalog names must be non-empty strings")
            values.extend(parse_npm_overrides(path, entries, f"catalogs.{catalog_name}", "catalog"))
    values.extend(parse_npm_overrides(path, document.get("overrides"), "overrides"))
    unsupported = {"packageExtensions", "patchedDependencies"} & set(document)
    if unsupported:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: unsupported dependency-bearing pnpm workspace fields: {', '.join(sorted(unsupported))}")
    return values
def package_lock_name(entry_path: str, entry: dict[str, Any]) -> str:
    """Resolve the package name represented by one lockfile package entry."""
    if entry.get("name"):
        return str(entry["name"])
    if "node_modules/" in entry_path:
        return entry_path.rsplit("node_modules/", 1)[1]
    return ""
def valid_sha512_integrity(value: Any) -> bool:
    """Require one valid SHA-512 SRI value rather than accepting an opaque integrity string."""
    text = str(value or "")
    if not text.startswith("sha512-"):
        return False
    try:
        return len(base64.b64decode(text[7:], validate=True)) == 64
    except (ValueError, TypeError):
        return False
def validate_npm_lock_source(path: Path, name: str, version: str, entry: dict[str, Any], label: str) -> None:
    """Reject lock entries whose tarball origin or integrity is not canonical and immutable."""
    parsed = urlparse(str(entry.get("resolved", "")))
    leaf = name.rsplit("/", 1)[-1]
    expected = f"/{name}/-/{leaf}-{version}.tgz"
    if parsed.scheme != "https" or parsed.netloc != "registry.npmjs.org" or parsed.username or parsed.password or parsed.query or parsed.fragment or unquote(parsed.path) != expected:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {label} must resolve from canonical npm tarball {expected}")
    if not valid_sha512_integrity(entry.get("integrity")):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {label} requires valid sha512 integrity")
def parse_package_lock(path: Path) -> list[dict[str, str]]:
    """Extract direct and override coordinates from an npm lockfile."""
    values, defects = parse_package_lock_npm_entries(path)
    if defects:
        raise UnsupportedDependencyFormat(str(defects[0]["message"]))
    return values


def collect_legacy_lock_rows(
    path: Path,
    entries: dict[str, Any],
    rows: list[tuple[str, Any]],
) -> None:
    """Flatten a legacy nested lock graph into path-independent package rows."""
    for package_name, package_entry in sorted(entries.items()):
        rows.append((f"node_modules/{package_name}", package_entry))
        if not isinstance(package_entry, dict) or "dependencies" not in package_entry:
            continue
        nested = package_entry["dependencies"]
        if not isinstance(nested, dict):
            raise UnsupportedDependencyFormat(
                f"{path.as_posix()}: nested dependencies for {package_name!r} must be an object"
            )
        collect_legacy_lock_rows(path, nested, rows)


def package_lock_rows(path: Path, document: dict[str, Any]) -> list[tuple[str, Any]]:
    """Select modern package rows or flatten the supported legacy lock shape."""
    packages = document.get("packages")
    if isinstance(packages, dict):
        return sorted(packages.items())
    dependencies = document.get("dependencies")
    if not isinstance(dependencies, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: unsupported package-lock format")
    rows: list[tuple[str, Any]] = []
    collect_legacy_lock_rows(path, dependencies, rows)
    return rows


def lock_version_defect(path: Path, name: str, value: Any) -> dict[str, Any] | None:
    """Return the exact-version defect for one lock entry when present."""
    if isinstance(value, str) and NPM_EXACT.fullmatch(value):
        return None
    return npm_defect(
        "lock",
        name,
        "version",
        value,
        f"{path.as_posix()}: lock package {name!r} must use an exact major.minor.patch registry version",
    )


def lock_source_defect(path: Path, name: str, version: str, value: Any) -> dict[str, Any] | None:
    """Return the canonical-tarball defect for one lock entry when present."""
    leaf = name.rsplit("/", 1)[-1]
    expected = f"/{name}/-/{leaf}-{version}.tgz"
    parsed = urlparse(str(value or ""))
    valid = (
        parsed.scheme == "https"
        and parsed.netloc == "registry.npmjs.org"
        and not parsed.username
        and not parsed.password
        and not parsed.query
        and not parsed.fragment
        and unquote(parsed.path) == expected
    )
    if valid:
        return None
    return npm_defect(
        "lock",
        name,
        "source",
        value,
        f"{path.as_posix()}: lock package {name!r} must resolve from canonical npm tarball {expected}",
    )


def lock_integrity_defect(path: Path, name: str, value: Any) -> dict[str, Any] | None:
    """Return the immutable SHA-512 defect for one lock entry when present."""
    if valid_sha512_integrity(value):
        return None
    return npm_defect(
        "lock",
        name,
        "integrity",
        value,
        f"{path.as_posix()}: lock package {name!r} requires valid sha512 integrity",
    )


def append_package_lock_entry(
    path: Path,
    entry_path: str,
    raw_entry: Any,
    values: list[dict[str, str]],
    defects: list[dict[str, Any]],
) -> None:
    """Classify one lock row and append either a coordinate or all of its defects."""
    if entry_path == "":
        return
    if not isinstance(raw_entry, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: lock entry {entry_path!r} must be an object")
    if raw_entry.get("link") is True:
        return
    node_module = "node_modules/" in entry_path
    if not node_module and not raw_entry.get("resolved"):
        return
    name = package_lock_name(entry_path, raw_entry)
    if not name:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: lock entry {entry_path!r} lacks an exact name")
    raw_version = raw_entry.get("version")
    version = raw_version if isinstance(raw_version, str) else ""
    entry_defects = [
        defect
        for defect in (
            lock_version_defect(path, name, raw_version),
            lock_source_defect(path, name, version, raw_entry.get("resolved")),
            lock_integrity_defect(path, name, raw_entry.get("integrity")),
        )
        if defect is not None
    ]
    defects.extend(entry_defects)
    if entry_defects:
        return
    artifact_type = (
        "development"
        if raw_entry.get("dev") is True
        else "optional"
        if raw_entry.get("optional") is True
        else "transitive"
    )
    values.append(dependency(name, "npm", version, artifact_type))


def parse_package_lock_npm_entries(path: Path) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Extract npm lock coordinates while preserving entry-level legacy defects for ratcheting."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid package-lock.json: {exc}") from exc
    if not isinstance(document, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: package-lock.json must contain an object")
    values: list[dict[str, str]] = []
    defects: list[dict[str, Any]] = []
    for entry_path, raw_entry in package_lock_rows(path, document):
        append_package_lock_entry(path, str(entry_path), raw_entry, values, defects)
    return values, defects


def extract_npm_dependencies(path: Path, *, logical_path: str | None = None) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Return tolerant npm extraction results only for manifest and lock entry ratcheting."""
    name = Path(logical_path).name if logical_path is not None else path.name
    if name == "package.json":
        return parse_package_json_npm_entries(path)
    if name == "package-lock.json":
        return parse_package_lock_npm_entries(path)
    return extract_dependencies(path, logical_path=logical_path), []
def xml_child(element: ET.Element, name: str) -> ET.Element | None:
    """Find a direct Maven XML child without exposing namespace details."""
    return next((child for child in element if child.tag.rsplit("}", 1)[-1] == name), None)
def xml_text(element: ET.Element, name: str) -> str:
    """Read trimmed text from one direct Maven XML child."""
    child = xml_child(element, name)
    return "" if child is None else str(child.text or "").strip()
def exact_maven_version(path: Path, coordinate: str, raw: str, properties: dict[str, str]) -> str:
    """Resolve one Maven property reference to an exact version."""
    version = raw.strip()
    match = re.fullmatch(r"\$\{([^}]+)\}", version)
    if match:
        version = properties.get(match.group(1), "")
    if not MAVEN_VERSION.fullmatch(version) or version.upper() in {"LATEST", "RELEASE"} or version.upper().endswith("-SNAPSHOT"):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: Maven dependency {coordinate!r} must resolve to an exact non-SNAPSHOT version")
    return version
def maven_coordinate(path: Path, element: ET.Element, properties: dict[str, str], artifact_type: str) -> dict[str, str]:
    """Convert one Maven dependency or plug-in element into a coordinate."""
    group = xml_text(element, "groupId")
    artifact = xml_text(element, "artifactId")
    version = xml_text(element, "version")
    if not MAVEN_ID.fullmatch(group) or not MAVEN_ID.fullmatch(artifact) or not version:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: Maven {artifact_type} entries require exact groupId, artifactId, and version")
    name = f"{group}:{artifact}"
    resolved = exact_maven_version(path, name, version, properties)
    return dependency(name, "maven", resolved, artifact_type)
def load_maven_root(path: Path) -> ET.Element:
    """Parse a Maven document and reject unsafe XML constructs."""
    try:
        source = path.read_text(encoding="utf-8")
        if "<!DOCTYPE" in source.upper() or "<!ENTITY" in source.upper():
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: Maven XML declarations with entities are unsupported")
        root = ET.fromstring(source)
    except (OSError, UnicodeError, ET.ParseError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid Maven POM: {exc}") from exc
    if root.tag.rsplit("}", 1)[-1] != "project":
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: Maven POM root must be project")
    return root
def maven_properties(root: ET.Element) -> dict[str, str]:
    """Collect project version properties used by direct coordinates."""
    parent = xml_child(root, "parent")
    project_group = xml_text(root, "groupId") or (xml_text(parent, "groupId") if parent is not None else "")
    project_version = xml_text(root, "version") or (xml_text(parent, "version") if parent is not None else "")
    properties = {"project.groupId": project_group, "pom.groupId": project_group, "project.version": project_version, "pom.version": project_version}
    if parent is not None:
        properties["project.parent.version"] = xml_text(parent, "version")
        properties["parent.version"] = xml_text(parent, "version")
    properties_node = xml_child(root, "properties")
    if properties_node is not None:
        for child in properties_node:
            key = child.tag.rsplit("}", 1)[-1]
            properties[key] = str(child.text or "").strip()
    return properties
def maven_dependency_type(container: ET.Element, parents: dict[ET.Element, ET.Element], scope: str) -> str:
    """Classify a Maven dependency by management and scope location."""
    ancestor = parents.get(container)
    ancestor_name = "" if ancestor is None else ancestor.tag.rsplit("}", 1)[-1]
    if ancestor_name == "dependencyManagement":
        return "managed"
    if ancestor_name == "plugin":
        return "plugin-dependency"
    return {"test": "development", "provided": "provided", "runtime": "runtime", "import": "managed"}.get(scope, "direct")
def maven_dependencies(path: Path, root: ET.Element, properties: dict[str, str]) -> list[dict[str, str]]:
    """Extract exact Maven dependency coordinates from a parsed project."""
    values: list[dict[str, str]] = []
    parents = {child: node for node in root.iter() for child in node}
    for container in root.iter():
        if container.tag.rsplit("}", 1)[-1] != "dependencies":
            continue
        for entry in container:
            if entry.tag.rsplit("}", 1)[-1] != "dependency":
                continue
            artifact_type = maven_dependency_type(container, parents, xml_text(entry, "scope"))
            values.append(maven_coordinate(path, entry, properties, artifact_type))
    return values
def maven_plugins(path: Path, root: ET.Element, properties: dict[str, str]) -> list[dict[str, str]]:
    """Extract exact Maven build plug-in coordinates from a parsed project."""
    values: list[dict[str, str]] = []
    for plugin in root.iter():
        if plugin.tag.rsplit("}", 1)[-1] != "plugin":
            continue
        if not xml_text(plugin, "groupId"):
            group = ET.Element("groupId")
            group.text = "org.apache.maven.plugins"
            plugin.insert(0, group)
        values.append(maven_coordinate(path, plugin, properties, "plugin"))
    build = xml_child(root, "build")
    extensions = None if build is None else xml_child(build, "extensions")
    if extensions is not None:
        for extension in extensions:
            if extension.tag.rsplit("}", 1)[-1] == "extension":
                values.append(maven_coordinate(path, extension, properties, "build-extension"))
    return values
def validate_maven_repositories(path: Path, root: ET.Element) -> None:
    """Allow only explicit canonical Maven Central repository declarations."""
    for container in root.iter():
        kind = container.tag.rsplit("}", 1)[-1]
        if kind not in {"repositories", "pluginRepositories"}:
            continue
        for repository in container:
            if repository.tag.rsplit("}", 1)[-1] != "repository":
                continue
            source = xml_text(repository, "url").rstrip("/")
            if source not in CANONICAL_MAVEN_REPOSITORIES:
                raise UnsupportedDependencyFormat(f"{path.as_posix()}: {kind} must use a canonical Maven Central HTTPS URL")
def parse_maven_pom(path: Path) -> list[dict[str, str]]:
    """Extract all governed coordinates from one Maven project file."""
    root = load_maven_root(path)
    validate_maven_repositories(path, root)
    properties = maven_properties(root)
    parent = xml_child(root, "parent")
    values = [] if parent is None else [maven_coordinate(path, parent, properties, "parent")]
    return [*values, *maven_dependencies(path, root, properties), *maven_plugins(path, root, properties)]
def canonical_npm_registry(value: Any) -> bool:
    """Accept only the canonical HTTPS npm registry without credentials or URL ambiguity."""
    parsed = urlparse(str(value or "").rstrip("/"))
    return parsed.geturl() == CANONICAL_NPM_REGISTRY and not parsed.username and not parsed.password
def npm_config_violation(key: str, value: str) -> str:
    """Classify credential-bearing or transport-weakening npm configuration."""
    lowered = key.lower()
    transport = lowered.rsplit(":", 1)[-1]
    while transport.endswith("[]"):
        transport = transport[:-2]
    if any(token in lowered for token in ("auth", "username", "password")):
        return "auth-bearing"
    weakened = transport == "strict-ssl" and value.lower() != "true"
    custom_transport = transport != "strict-ssl" and (transport in {"ca", "key"} or any(token in transport for token in ("proxy", "cafile", "cert")))
    return "transport trust" if weakened or custom_transport else ""
def unsafe_yarn_transport(key: str, value: Any) -> bool:
    """Identify Yarn settings that weaken or replace the canonical TLS transport."""
    lowered = key.lower()
    return (lowered == "enablestrictssl" and value is not True) or (lowered != "enablestrictssl" and any(token in lowered for token in ("proxy", "unsafehttp", "cafile", "cert", "tls")))
def parse_npmrc(path: Path) -> list[dict[str, str]]:
    """Validate npm registry configuration; it carries no release-age coordinates itself."""
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith(("#", ";")):
            continue
        if "=" not in stripped:
            raise UnsupportedDependencyFormat(f"{path.as_posix()}:{number}: ambiguous npm configuration syntax")
        key, value = (part.strip() for part in stripped.split("=", 1))
        lowered = key.lower()
        violation = npm_config_violation(key, value)
        if violation:
            raise UnsupportedDependencyFormat(f"{path.as_posix()}:{number}: npm {violation} configuration {key!r} is prohibited")
        if lowered == "registry" or lowered.endswith(":registry"):
            if not canonical_npm_registry(value):
                raise UnsupportedDependencyFormat(f"{path.as_posix()}:{number}: registry must be {CANONICAL_NPM_REGISTRY}/")
        elif "registry" in lowered:
            raise UnsupportedDependencyFormat(f"{path.as_posix()}:{number}: ambiguous registry configuration key {key!r}")
    return []
def validate_yarn_entry(path: Path, key: str, value: Any, label: str) -> bool:
    """Validate one registry-sensitive Yarn key and report whether recursion is complete."""
    lowered = key.lower()
    if lowered in {"npmauthtoken", "npmauthident"}:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: auth-bearing Yarn configuration is prohibited at {label}")
    if unsafe_yarn_transport(key, value):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: Yarn transport trust configuration is prohibited at {label}")
    if key in {"npmRegistryServer", "npmPublishRegistry"} and not canonical_npm_registry(value):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: {label} must be {CANONICAL_NPM_REGISTRY}/")
    if key == "npmRegistries":
        if not isinstance(value, dict) or any(not canonical_npm_registry(registry) for registry in value):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: {label} contains an alternate or ambiguous registry")
        for registry, settings in value.items():
            validate_yarn_node(path, settings, f"{label}.{registry}")
        return True
    if "registry" in lowered and key not in {"npmRegistryServer", "npmPublishRegistry"}:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: ambiguous Yarn registry key {label}")
    return False
def validate_yarn_node(path: Path, node: Any, trail: str = "") -> None:
    """Recursively reject alternate registries and credential-bearing Yarn configuration."""
    if isinstance(node, list):
        for index, value in enumerate(node):
            validate_yarn_node(path, value, f"{trail}[{index}]")
        return
    if not isinstance(node, dict):
        return
    for raw_key, value in node.items():
        key = str(raw_key)
        label = f"{trail}.{key}" if trail else key
        if validate_yarn_entry(path, key, value, label):
            continue
        validate_yarn_node(path, value, label)
def parse_yarnrc(path: Path) -> list[dict[str, str]]:
    """Validate Yarn registry configuration; it carries no release-age coordinates itself."""
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid Yarn configuration: {exc}") from exc
    if not isinstance(document, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: Yarn configuration must contain a mapping")
    validate_yarn_node(path, document)
    return []
def reject_workflow_images(path: Path, job: dict[str, Any], job_name: str) -> None:
    """Fail closed until container and service images have an immutable evidence parser."""
    declared = {field for field in ("container", "services") if field in job}
    if declared:
        message = f"{path.as_posix()}: job {job_name!r} remote image fields are unsupported: {', '.join(sorted(declared))}"
        raise UnsupportedDependencyFormat(message)
def workflow_uses(document: dict[str, Any], path: Path) -> list[str]:
    """Collect exact action commit references from a workflow document."""
    jobs = document.get("jobs")
    if not isinstance(jobs, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: workflow jobs must be a mapping")
    found: list[str] = []
    for job_name, job in sorted(jobs.items()):
        if not isinstance(job, dict):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: job {job_name!r} must be a mapping")
        reject_workflow_images(path, job, str(job_name))
        if "uses" in job:
            if not isinstance(job["uses"], str):
                raise UnsupportedDependencyFormat(f"{path.as_posix()}: job {job_name!r} uses must be a string")
            found.append(job["uses"])
        steps = job.get("steps", [])
        if not isinstance(steps, list):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: job {job_name!r} steps must be a list")
        for number, step in enumerate(steps, start=1):
            if not isinstance(step, dict):
                raise UnsupportedDependencyFormat(f"{path.as_posix()}: job {job_name!r} step {number} must be a mapping")
            if "uses" in step:
                if not isinstance(step["uses"], str):
                    raise UnsupportedDependencyFormat(f"{path.as_posix()}: job {job_name!r} step {number} uses must be a string")
                found.append(step["uses"])
    return found
def parse_workflow(path: Path) -> list[dict[str, str]]:
    """Parse a workflow and extract its governed action coordinates."""
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: invalid workflow YAML: {exc}") from exc
    if not isinstance(document, dict):
        raise UnsupportedDependencyFormat(f"{path.as_posix()}: workflow must contain a mapping")
    values: list[dict[str, str]] = []
    for uses in workflow_uses(document, path):
        if uses.startswith("./"):
            continue
        if uses.startswith("docker://"):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: docker action references require a file-digest override")
        if "@" not in uses:
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: action {uses!r} has no immutable revision")
        name, version = uses.rsplit("@", 1)
        if not name or not ACTION_SHA.fullmatch(version):
            raise UnsupportedDependencyFormat(f"{path.as_posix()}: action {uses!r} must be pinned to a 40-character commit SHA")
        values.append(dependency(name, "github-actions", version.lower(), "ci"))
    return values
def extract_dependencies(path: Path, *, logical_path: str | None = None) -> list[dict[str, str]]:
    """Extract the complete supported dependency surface or fail closed."""
    identity = Path(logical_path) if logical_path is not None else path
    name = identity.name
    relative = identity.as_posix()
    parsers = {"package.json": parse_package_json, "package-lock.json": parse_package_lock, "pnpm-workspace.yaml": parse_pnpm_workspace, "pom.xml": parse_maven_pom, ".npmrc": parse_npmrc, ".yarnrc.yml": parse_yarnrc}
    parser = parse_requirements if fnmatch.fnmatch(name, "requirements*.txt") else parsers.get(name)
    if relative.startswith(".github/workflows/") and path.suffix in {".yml", ".yaml"}:
        parser = parse_workflow
    if parser is None:
        raise UnsupportedDependencyFormat(f"{relative}: governed dependency format has no deterministic starter parser")
    values = parser(path)
    unique = {
        (item["ecosystem"], item["name"], item["version"], item["artifact_type"]): item
        for item in values
    }
    return [unique[key] for key in sorted(unique)]
