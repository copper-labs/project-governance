"""Launch the bundled continuity module with this governance generation's executor."""

from __future__ import annotations

from importlib.resources import files
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from .runtime_access import runtime_reader


NODE_PROBE = """const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) process.exit(1);
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:'); db.prepare('SELECT 1').get(); db.close();
"""


def command(arguments: list[str]) -> tuple[list[str], dict[str, str]]:
    """Resolve package-owned sources and validate Node before any task state is touched."""
    requested = os.environ.get("GOVERNANCE_NODE", "node")
    node = shutil.which(requested)
    if node is None:
        raise RuntimeError("Continuity requires Node 22.18+; install it or set GOVERNANCE_NODE to its executable")
    probe = subprocess.run([node, "--no-warnings", "-e", NODE_PROBE],
                           capture_output=True, timeout=10, check=False)
    if probe.returncode:
        raise RuntimeError("Continuity requires Node 22.18+ with native SQLite support")
    payload = Path(str(files("project_governance_runtime").joinpath("assets", "harness")))
    if not (payload / "src/cli.ts").is_file():
        raise RuntimeError("Bundled continuity is missing; install a complete governance wheel")
    scripts = Path(sys.executable).absolute().parent
    executor, governance = scripts / "harness-agent", scripts / "project-governance"
    if not executor.is_file() or not governance.is_file():
        raise RuntimeError("This governance environment is incomplete; reinstall its wheel")
    from . import __version__

    environment = {**os.environ,
                   "GOVERNANCE_CONTINUITY_EXECUTOR": str(executor),
                   "GOVERNANCE_CONTINUITY_COMMAND": str(governance),
                   "GOVERNANCE_CONTINUITY_VERSION": __version__}
    return [node, "--experimental-strip-types", "--no-warnings", str(payload / "src/cli.ts"), *arguments], environment


def main(arguments: list[str] | None = None) -> int:
    """Retain the runtime reader lease until the continuity subprocess finishes."""
    try:
        with runtime_reader(join=False):
            argv, environment = command(sys.argv[1:] if arguments is None else arguments)
            result = subprocess.run(argv, env=environment, check=False)
            return result.returncode if result.returncode >= 0 else 128 - result.returncode
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 2
