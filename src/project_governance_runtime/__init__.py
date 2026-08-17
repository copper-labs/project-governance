"""Expose package identity for the project-neutral repository governance runtime."""

from importlib.metadata import PackageNotFoundError, version


try:
    __version__ = version("project-governance-runtime")
except PackageNotFoundError:
    __version__ = "source-tree"
