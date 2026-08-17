#!/usr/bin/env python3
"""Responsibility: Enforce Swift Package Manager first and gate CocoaPods exceptions.

Context: Impacted checks block changed CocoaPods surfaces, while exhaustive audits report untouched
legacy adoption without making unrelated changes noisy.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from apple_dependency_evaluation import evaluate


DEFAULT_POLICY = Path("config/policies/apple-dependencies.yaml")
DEFAULT_EXCEPTIONS = Path("config/policies/apple-dependency-exceptions.yaml")


def main() -> int:
    """Evaluate changed surfaces or report baseline debt for an exhaustive audit."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--changed", action="store_true")
    mode.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    parser.add_argument("--exceptions", type=Path, default=DEFAULT_EXCEPTIONS)
    parser.add_argument(
        "--exceptions-schema",
        type=Path,
        default=Path("schema/apple-dependency-exception.schema.json"),
    )
    parser.add_argument("--stage", default=os.environ.get("GOVERNANCE_STAGE", "pre-commit"))
    parser.add_argument("--work-id", default=os.environ.get("GOVERNANCE_WORK_ID", ""))
    exit_code, report = evaluate(parser.parse_args())
    print(json.dumps(report, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
