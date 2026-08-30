#!/usr/bin/env python3
"""Run the built-in KMP surface validator through the standard pack envelope."""

from __future__ import annotations

import json
from pathlib import Path

from project_governance_runtime.kmp_surface_validation import (
    STRUCTURE_RULE,
    validate_kmp_surface,
)


def main() -> int:
    """Emit one fail-closed checker result without a second CLI contract."""
    try:
        result = validate_kmp_surface(Path.cwd())
    except (OSError, RuntimeError, ValueError) as error:
        result = {
            "status": "failed",
            "findings": [
                {
                    "severity": "blocking",
                    "rule_id": STRUCTURE_RULE,
                    "message": str(error),
                }
            ],
        }
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
