"""Stop remaining native programs after worker death while retaining the environment lock."""

import os
from pathlib import Path
import sys
import time

from .config import TERMINAL
from .completion import attempt
from .jobs import finish_cleanup
from .processes import collect, record, same_process, terminate_owned
from .storage import atomic_json, read_json, validate_record


def main():
    """Hold the environment lock and stop recorded provider programs after worker death."""
    os.umask(0o077)
    path = Path(sys.argv[1])
    worker = read_json(path / "worker.json")
    atomic_json(path / "guardian.json", record(os.getpid()))
    while True:
        provider = read_json(path / "provider.json")
        if provider:
            collect(path, provider)
        value = validate_record(read_json(path / "status.json"))
        if value["state"] in TERMINAL:
            if terminate_owned(path, provider, grace=.1):
                attempt(path)
                return
        elif not same_process(worker):
            if terminate_owned(path, provider, grace=.2):
                if finish_cleanup(path)["state"] in TERMINAL:
                    attempt(path)
                    return
        time.sleep(.25)


if __name__ == "__main__":
    main()
