"""Do not execute native work until its process identity is durably supervised."""

import os
import sys


def main():
    """Permit native execution only after the parent publishes this process identity."""
    gate = int(sys.argv[1])
    try:
        permit = os.read(gate, 1)
    finally:
        os.close(gate)
    # Worker death closes the only writer. No provider work starts on EOF.
    if permit != b"1":
        return 1
    os.execv(sys.argv[2], sys.argv[2:])


if __name__ == "__main__":
    raise SystemExit(main())
