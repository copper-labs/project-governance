"""Stop remaining native programs after worker death while retaining the environment lock."""

import os
from pathlib import Path
import sys
import time

from .config import TERMINAL
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
                return
        elif not same_process(worker):
            if terminate_owned(path, provider, grace=.2):
                error = "Worker exited before completion; partial work is preserved"
                state = "cancelled" if (path / "cancel.json").exists() else "failed"
                atomic_json(path / "result.json", {
                    "protocol_version": value["protocol_version"], "job_id": path.name, "state": state,
                    "answer": "", "error": error, "remaining": [error], "cleanup_confirmed": True})
                atomic_json(path / "status.json", {**value, "state": state, "stage": error, "finished_at": time.time()})
                return
        time.sleep(.25)


if __name__ == "__main__":
    main()
