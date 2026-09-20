"""Place the canonical continuity sources in wheel build output, never in the checkout."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil

from setuptools.command.build_py import build_py


class BuildWithHarness(build_py):
    """Keep the internal Node payload in the same immutable artifact as governance."""

    def run(self):
        """Assemble the normal Python build and its exact continuity payload."""
        super().run()
        source = Path(__file__).resolve().parents[1] / "components/harness"
        target = Path(self.build_lib) / "project_governance_runtime/assets/harness"
        # A reused build directory must not retain files deleted from the canonical module.
        if target.exists():
            shutil.rmtree(target)
        inventory = {}
        for path in sorted((source / "src").rglob("*.ts")):
            if path.is_symlink():
                raise ValueError("Continuity runtime sources must not be symlinks")
            relative = path.relative_to(source)
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
            inventory[relative.as_posix()] = hashlib.sha256(destination.read_bytes()).hexdigest()
        if "src/cli.ts" not in inventory:
            raise ValueError("Continuity CLI is missing from the source distribution")
        package = {"name": "@organta/harness", "private": True, "type": "module",
                   "version": self.distribution.get_version(), "engines": {"node": ">=22.18"}}
        (target / "package.json").write_text(json.dumps(package, sort_keys=True) + "\n")
        inventory["package.json"] = hashlib.sha256((target / "package.json").read_bytes()).hexdigest()
        (target / "payload-manifest.json").write_text(json.dumps(
            {"schema_version": 1, "version": self.distribution.get_version(), "files": inventory},
            indent=2, sort_keys=True) + "\n")
