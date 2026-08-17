#!/usr/bin/env python3
"""Build the governance wheel with a semantic release or traceable development version."""

from __future__ import annotations

import sys
from pathlib import Path

from setuptools import setup

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
from release_version import git_version  # noqa: E402


setup(version=git_version())
