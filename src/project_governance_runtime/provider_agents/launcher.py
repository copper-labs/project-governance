"""Do not execute native work until its process identity is durably supervised."""

import os
import signal
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
        return failed("execution gate closed before permission")
    try:
        os.execv(sys.argv[2], sys.argv[2:])
    except OSError as error:
        return failed("canonical executable could not start: " + str(error))


def failed(message):
    """Use signal termination so launch failure cannot match any accepted native exit code."""
    print("Harness launch failed: " + message, file=sys.stderr, flush=True)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    os.kill(os.getpid(), signal.SIGTERM)


if __name__ == "__main__":
    raise SystemExit(main())
