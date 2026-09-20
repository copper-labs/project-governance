#!/usr/bin/env python3
"""Build the governance wheel with a semantic release or traceable development version."""

from __future__ import annotations

import sys
from pathlib import Path

from setuptools import setup

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
from release_version import git_version  # noqa: E402
from build_harness import BuildWithHarness  # noqa: E402


def source_version():
    """An sdist retains its prepared version without needing its original Git repository."""
    root = Path(__file__).resolve().parent
    metadata = root / "PKG-INFO"
    if metadata.is_file() and not (root / ".git").exists():
        from email.parser import Parser

        return Parser().parsestr(metadata.read_text())["Version"]
    return git_version()


setup(version=source_version(), cmdclass={"build_py": BuildWithHarness})
