#!/usr/bin/env python3
"""Forward native startup events to the exact repository runtime without discovering releases here."""

import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    """Exclude workers before starting the runtime; leave all update policy in the wheel."""
    raw = sys.stdin.buffer.read(65537)
    try:
        event = json.loads(raw) if len(raw) <= 65536 else {}
    except ValueError:
        event = {}
    if (not isinstance(event, dict) or event.get("agent_id") or event.get("hook_event_name") == "SubagentStart"
            or os.environ.get("HARNESS_AGENT_ANCESTRY") or os.environ.get("GOVERNANCE_PARENT_TASK")):
        return 0
    root = Path(__file__).resolve().parents[1]
    python = root / ".governance/runtime/bin/python"
    if not python.is_file() or len(sys.argv) != 2:
        print(json.dumps({"systemMessage": "Governance startup update deferred: bootstrap the locked runtime first"}))
        return 0
    return subprocess.run([str(python), "-m", "project_governance_runtime.startup", "event", "--provider", sys.argv[1]],
                          cwd=root, input=raw, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
