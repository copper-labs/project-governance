#!/usr/bin/env python3
"""Responsibility: Parse Kotlin declarations offline for governance checks.

Context: The comment adapter uses this token parser to identify declarations, declared visibility,
stable signatures, and brace-bounded ownership without requiring a project-specific Kotlin build.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


PARSER_VERSION = "governance-v6"


@dataclass(frozen=True)
class Declaration:
    """Describe one named Kotlin declaration and the source extent needed by governance checks."""

    kind: str
    name: str
    line: int
    header_end_line: int
    end_line: int
    offset: int
    public: bool
    signature: str


@dataclass(frozen=True)
class Token:
    """Preserve one sanitized Kotlin token's source position."""

    value: str
    offset: int
    line: int


def blank_non_newlines(chars: list[str], start: int, end: int) -> None:
    """Blank one sanitized span without disturbing its line structure."""
    for position in range(start, min(len(chars), end)):
        if chars[position] != "\n":
            chars[position] = " "


def comment_end(text: str, index: int, pair: str) -> int:
    """Return the first offset after one line or block comment."""
    if pair == "//":
        end = text.find("\n", index)
        return len(text) if end < 0 else end
    end = text.find("*/", index + 2)
    return len(text) if end < 0 else end + 2


def quoted_end(text: str, index: int) -> int:
    """Return the first offset after one quoted or triple-quoted literal."""
    quote = text[index]
    width = 3 if quote == '"' and text[index:index + 3] == '"""' else 1
    end = text.find(quote * width, index + width)
    return len(text) if end < 0 else end + width


def sanitized(text: str) -> str:
    """Replace comments and strings with whitespace while retaining offsets and line numbers."""
    chars = list(text)
    index = 0
    while index < len(chars):
        pair = text[index:index + 2]
        if pair in {"//", "/*"}:
            end = comment_end(text, index, pair)
            blank_non_newlines(chars, index, end)
            index = end
            continue
        if text[index] in {'"', "'"}:
            end = quoted_end(text, index)
            blank_non_newlines(chars, index, end)
            index = end
            continue
        index += 1
    return "".join(chars)


def tokens(text: str) -> list[Token]:
    """Return position-preserving tokens from sanitized Kotlin source."""
    clean = sanitized(text)
    return [
        Token(match.group(0), match.start(), clean.count("\n", 0, match.start()) + 1)
        for match in re.finditer(r"[A-Za-z_]\w*|[^\s]", clean)
    ]


def declaration_prefix(stream: list[Token], index: int) -> set[str]:
    """Collect modifiers between the preceding declaration boundary and one keyword."""
    boundary = index - 1
    while boundary >= 0 and stream[boundary].value not in {
        "{", "}", ";", "val", "var", "class", "interface", "object", "fun", "typealias"
    }:
        boundary -= 1
    return {item.value for item in stream[boundary + 1:index]}


def body_extent(
    stream: list[Token], start: int, fallback_line: int
) -> tuple[int, int]:
    """Return the declaration-header end and brace-bounded body end."""
    delimiter = None
    for position in range(start, len(stream)):
        value = stream[position].value
        if value in {"{", "=", ";"}:
            delimiter = position
            break
        if value == "}" or value in {"class", "interface", "object", "fun", "typealias"}:
            break
    if delimiter is None:
        return fallback_line, fallback_line
    header_end_line = stream[delimiter].line
    if stream[delimiter].value != "{":
        return header_end_line, header_end_line
    depth = 0
    end_line = header_end_line
    for position in range(delimiter, len(stream)):
        depth += stream[position].value == "{"
        depth -= stream[position].value == "}"
        end_line = stream[position].line
        if depth == 0:
            break
    return header_end_line, end_line


def function_name_and_paren(
    stream: list[Token], index: int
) -> tuple[Token, int] | None:
    """Return a function's name token and opening-parenthesis position."""
    cursor = index + 1
    before_paren: list[Token] = []
    angle_depth = 0
    while cursor < len(stream):
        value = stream[cursor].value
        if value == "<":
            angle_depth += 1
        elif value == ">" and angle_depth:
            angle_depth -= 1
        elif value == "(" and angle_depth == 0:
            break
        elif re.match(r"^[A-Za-z_]\w*$", value):
            before_paren.append(stream[cursor])
        if value in {"{", "}", ";", "="} and angle_depth == 0:
            break
        cursor += 1
    if cursor >= len(stream) or stream[cursor].value != "(" or not before_paren:
        return None
    return before_paren[-1], cursor


def closing_parenthesis(stream: list[Token], opening: int) -> int:
    """Return the matching close-parenthesis position for a function signature."""
    paren_depth = 0
    close_paren = opening
    for position in range(opening, len(stream)):
        paren_depth += stream[position].value == "("
        paren_depth -= stream[position].value == ")"
        close_paren = position
        if paren_depth == 0:
            break
    return close_paren


def function_declaration(
    stream: list[Token], index: int, public: bool
) -> Declaration | None:
    """Parse one named Kotlin function beginning at a `fun` token."""
    name_and_paren = function_name_and_paren(stream, index)
    if name_and_paren is None:
        return None
    name_token, opening_paren = name_and_paren
    close_paren = closing_parenthesis(stream, opening_paren)
    signature = " ".join(item.value for item in stream[index + 1:close_paren + 1])
    header_end_line, end_line = body_extent(stream, close_paren + 1, stream[index].line)
    return Declaration(
        "function",
        name_token.value,
        stream[index].line,
        header_end_line,
        end_line,
        stream[index].offset,
        public,
        signature,
    )


def type_declaration(
    stream: list[Token], index: int, public: bool
) -> Declaration | None:
    """Parse one named Kotlin class, interface, or object declaration."""
    cursor = index + 1
    if cursor >= len(stream) or not re.match(r"^[A-Za-z_]\w*$", stream[cursor].value):
        return None
    name_token = stream[cursor]
    header_end_line, end_line = body_extent(stream, cursor + 1, stream[index].line)
    return Declaration(
        "type",
        name_token.value,
        stream[index].line,
        header_end_line,
        end_line,
        stream[index].offset,
        public,
        name_token.value,
    )


def declarations(text: str) -> list[Declaration]:
    """Extract named Kotlin declarations with declared visibility and source extents."""
    stream = tokens(text)
    result: list[Declaration] = []
    for index, token in enumerate(stream):
        if token.value not in {"class", "interface", "object", "fun"}:
            continue
        prefix = declaration_prefix(stream, index)
        public = not bool(prefix & {"private", "internal", "protected"})
        declaration = (
            function_declaration(stream, index, public)
            if token.value == "fun"
            else type_declaration(stream, index, public)
        )
        if declaration is not None:
            result.append(declaration)
    return result
