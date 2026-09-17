"""Acquire installation ownership before loading the ordinary runtime command graph."""

import sys

from .runtime_access import runtime_reader


def main():
    """Route replacement operations to their exclusive guard and ordinary commands to readers."""
    try:
        if len(sys.argv) > 2 and sys.argv[1] == "startup":
            from .cli import main as run

            return run()
        with runtime_reader(join=any(arg in {"doctor", "check", "plan", "validate-commit-message"} for arg in sys.argv[1:2])):
            from .cli import main as run

            return run()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
