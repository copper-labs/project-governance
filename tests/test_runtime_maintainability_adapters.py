#!/usr/bin/env python3
"""Prove the package uses native analyzers without weakening the 500-line gate."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-code-smells.py"
SCRIPTS = CHECKER.parent
DEFAULTS = ROOT / "src/project_governance_runtime/defaults"


def run_checker(root: Path, path: str, *, expected: int) -> dict[str, object]:
    """Run the packaged maintainability checker against one explicit source file."""
    result = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--path",
            path,
            "--policy",
            str(DEFAULTS / "policies/code-quality.yaml"),
            "--dispositions",
            str(DEFAULTS / "policies/code-quality-dispositions.yaml"),
            "--disposition-schema",
            str(DEFAULTS / "schemas/quality-disposition.schema.json"),
        ],
        cwd=root,
        env={**os.environ, "PYTHONPATH": str(SCRIPTS)},
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(result.stdout + result.stderr)
    return json.loads(result.stdout)


class RuntimeMaintainabilityAdapterTests(unittest.TestCase):
    """Keep TypeScript native parsing and parser-independent file sizing truthful."""

    def test_typescript_compiler_accepts_jsx_and_reports_type_extent(self) -> None:
        """Use the repository's official TypeScript package for TSX declaration facts."""
        if not (ROOT / "node_modules/typescript/package.json").is_file():
            self.skipTest("official TypeScript compiler is unavailable")
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            source = root / "Screen.tsx"
            source.write_text(
                "export class Screen { render() { return <StatusBar hidden />; } }\n",
                encoding="utf-8",
            )
            result = run_checker(root, source.name, expected=0)
        self.assertEqual(result["coverage"]["typescript-compiler"], 1)
        self.assertEqual(result["findings"], [])

    def test_every_recognized_source_blocks_above_500_without_an_adapter(self) -> None:
        """Apply physical file size before optional native enrichment."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            boundary = root / "Boundary.java"
            boundary.write_text("// line\n" * 500, encoding="utf-8")
            boundary_result = run_checker(root, boundary.name, expected=0)
            source = root / "Large.java"
            source.write_text("public class Large {}\n" + "// line\n" * 500, encoding="utf-8")
            result = run_checker(root, source.name, expected=1)
        self.assertEqual(boundary_result["findings"], [])
        finding = next(
            item for item in result["findings"] if item["rule_id"] == "quality.large-file"
        )
        self.assertEqual(finding["threshold"], 500)
        self.assertEqual(result["coverage"]["unenriched"], 1)


if __name__ == "__main__":
    unittest.main()
