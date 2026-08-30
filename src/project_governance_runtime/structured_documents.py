"""Load small YAML and JSON authorities with one reusable safety boundary."""

from __future__ import annotations

import json
from typing import Any

import yaml
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode


DOCUMENT_MAX_BYTES = 256 * 1024
DOCUMENT_MAX_DEPTH = 32
DOCUMENT_MAX_COLLECTION_ITEMS = 20_000
DOCUMENT_MAX_STRING_BYTES = 16_384
PATH_MAX_BYTES = 4_096


class StructuredDocumentError(ValueError):
    """Report one bounded document decoding or shape failure."""


class UniqueKeySafeLoader(yaml.SafeLoader):
    """Reject duplicate YAML keys instead of silently retaining the last value."""

    def construct_mapping(self, node: MappingNode, deep: bool = False) -> dict[Any, Any]:
        """Construct one mapping only after merge expansion and duplicate detection."""
        if not isinstance(node, MappingNode):
            raise ConstructorError(None, None, "expected a mapping node", node.start_mark)
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            try:
                duplicate = key in mapping
            except TypeError as error:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    "found an unhashable mapping key",
                    key_node.start_mark,
                ) from error
            if duplicate:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"found duplicate key {key!r}",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject duplicate JSON member names during decoding."""
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise StructuredDocumentError(f"found duplicate key {key!r}")
        value[key] = item
    return value


def _bounded_shape(value: Any) -> None:
    """Bound nested collections, aggregate entries, scalar strings, and aliases."""
    count = 0
    active: set[int] = set()

    def visit(item: Any, depth: int) -> None:
        nonlocal count
        if depth > DOCUMENT_MAX_DEPTH:
            raise StructuredDocumentError(
                f"document nesting exceeds {DOCUMENT_MAX_DEPTH} levels"
            )
        if isinstance(item, str):
            if len(item.encode("utf-8")) > DOCUMENT_MAX_STRING_BYTES:
                raise StructuredDocumentError(
                    f"scalar string exceeds {DOCUMENT_MAX_STRING_BYTES} UTF-8 bytes"
                )
            return
        if not isinstance(item, (dict, list)):
            return
        identity = id(item)
        if identity in active:
            raise StructuredDocumentError("recursive aliases are not supported")
        active.add(identity)
        try:
            entries = list(item.items()) if isinstance(item, dict) else list(enumerate(item))
            count += len(entries)
            if count > DOCUMENT_MAX_COLLECTION_ITEMS:
                raise StructuredDocumentError(
                    "document contains more than "
                    f"{DOCUMENT_MAX_COLLECTION_ITEMS} collection items"
                )
            for key, child in entries:
                if isinstance(item, dict):
                    visit(key, depth + 1)
                visit(child, depth + 1)
        finally:
            active.remove(identity)

    visit(value, 1)


def load_structured_document(data: bytes, *, format_name: str) -> Any:
    """Decode one exact bounded YAML or JSON byte string."""
    if len(data) > DOCUMENT_MAX_BYTES:
        raise StructuredDocumentError(f"document exceeds {DOCUMENT_MAX_BYTES} bytes")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise StructuredDocumentError("document must be valid UTF-8") from error
    try:
        if format_name == "yaml":
            value = yaml.load(text, Loader=UniqueKeySafeLoader)
        elif format_name == "json":
            value = json.loads(text, object_pairs_hook=_unique_json_object)
        else:
            raise StructuredDocumentError(f"unsupported document format {format_name!r}")
    except StructuredDocumentError:
        raise
    except (json.JSONDecodeError, yaml.YAMLError, RecursionError) as error:
        detail = getattr(error, "problem", None) or str(error)
        raise StructuredDocumentError(f"invalid {format_name}: {detail}") from error
    _bounded_shape(value)
    return value
