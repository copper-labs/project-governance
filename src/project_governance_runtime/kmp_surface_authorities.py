"""Load the bounded KMP surface graph and its sole target authority."""

from __future__ import annotations

from typing import Any

from .structured_documents import (
    DOCUMENT_MAX_BYTES,
    StructuredDocumentError,
    load_structured_document,
)
from .validation_subject import ValidationSubjectError


GRAPH_PATH = "config/validation/kmp-surfaces.yaml"


def _graph(validator: Any) -> dict[str, Any] | None:
    """Load and validate the exact top-level graph authority."""
    try:
        data = validator.subject.read_bytes(GRAPH_PATH, limit=DOCUMENT_MAX_BYTES)
    except ValidationSubjectError as error:
        validator.add(validator.reference_rule, str(error), path=GRAPH_PATH)
        return None
    try:
        value = load_structured_document(data, format_name="yaml")
    except StructuredDocumentError as error:
        validator.structure(f"{GRAPH_PATH}: {error}", path=GRAPH_PATH)
        return None
    mapping = validator.mapping(
        value,
        "graph",
        allowed={"kind", "schema_version", "target_catalog", "areas"},
        required={"kind", "schema_version", "target_catalog", "areas"},
    )
    if mapping is None:
        return None
    if mapping.get("kind") != "kmp-surface-validation":
        validator.structure("graph.kind must be kmp-surface-validation", path=GRAPH_PATH)
    if type(mapping.get("schema_version")) is not int or mapping.get("schema_version") != 1:
        validator.structure("graph.schema_version must be exactly 1", path=GRAPH_PATH)
    return mapping


def _catalog(validator: Any, path: str) -> list[str] | None:
    """Load and validate the graph-referenced target catalog."""
    try:
        data = validator.subject.read_bytes(path, limit=DOCUMENT_MAX_BYTES)
        value = load_structured_document(data, format_name="json")
    except (ValidationSubjectError, StructuredDocumentError) as error:
        validator.structure(f"{path}: {error}", path=path)
        return None
    mapping = validator.mapping(
        value,
        "target catalog",
        allowed={"kind", "schema_version", "targets"},
        required={"kind", "schema_version", "targets"},
    )
    if mapping is None:
        return None
    if mapping.get("kind") != "kmp-surface-target-catalog":
        validator.structure("target catalog kind must be kmp-surface-target-catalog", path=path)
    if type(mapping.get("schema_version")) is not int or mapping.get("schema_version") != 1:
        validator.structure("target catalog schema_version must be exactly 1", path=path)
    return validator.string_list(
        mapping.get("targets"), "target catalog targets", stable_ids=True
    )


def authority_inputs(validator: Any) -> tuple[list[str], list[Any]] | None:
    """Return catalog targets and graph areas after both documents are usable."""
    graph = _graph(validator)
    if graph is None:
        return None
    catalog_path = validator.reference(graph.get("target_catalog"), "target_catalog")
    if catalog_path is None:
        return None
    targets = _catalog(validator, catalog_path)
    if targets is None:
        return None
    areas = graph.get("areas")
    if not isinstance(areas, list) or not areas:
        validator.structure("graph.areas must be a non-empty list", path=GRAPH_PATH)
        return None
    return targets, areas
