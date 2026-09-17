"""Exchange bounded native frames while the worker retains process and timeout ownership."""

import json
import os
import selectors
import time

from .config import AgentError


class ProviderStream:
    """Keep provider pipes responsive to public progress, cancellation, and native requests."""

    def __init__(self, worker):
        self.worker, self.proc, self.protocol = worker, worker.proc, worker.protocol
        self.selector = selectors.DefaultSelector()
        self.stdin, self.stdout, self.stderr = self.proc.stdin, self.proc.stdout, self.proc.stderr
        self.pending = self.protocol.initial_input()
        self.buffers = {"stdout": b"", "stderr": b""}
        self.last_notice = time.monotonic()
        self.exited_at = self.completed_at = self.stopped_at = None

    def run(self):
        """Drain public output and close local pipe endpoints on every exit path."""
        try:
            self._register()
            while self.selector.get_map():
                action, issue = self._control()
                if action == "return":
                    return issue
                if action == "break":
                    break
                for key, _ in self.selector.select(.2):
                    if key.data == "stdin":
                        self._write_input()
                    else:
                        self._read_output(key)
            return self._wait_exit()
        finally:
            self.selector.close()
            for pipe in (self.stdin, self.stdout, self.stderr):
                if not pipe.closed:
                    pipe.close()

    def _register(self):
        for pipe in (self.stdin, self.stdout, self.stderr):
            os.set_blocking(pipe.fileno(), False)
        self.selector.register(self.stdout, selectors.EVENT_READ, "stdout")
        self.selector.register(self.stderr, selectors.EVENT_READ, "stderr")
        self.selector.register(self.stdin, selectors.EVENT_WRITE, "stdin")

    def _control(self):
        issue = self.worker.interrupted()
        if issue:
            return "return", issue
        now = time.monotonic()
        self.worker.heartbeat()
        if now - self.last_notice >= 15:
            self.worker.emit("heartbeat", message="Supervisor alive",
                seconds_since_provider_activity=round(now - self.worker.last_activity, 1))
            self.last_notice = now
        if self.proc.poll() is not None:
            self.exited_at = self.exited_at or now
            if now - self.exited_at > 1:
                return "break", None
        if self._server_finished(now):
            return "return", None
        if self.protocol.stop_requested and not self.pending:
            self.stopped_at = self.stopped_at or now
            if now - self.stopped_at >= .2:
                return "return", ("blocked", "Provider requires parent input or unavailable client capabilities")
        return "continue", None

    def _server_finished(self, now):
        if not self.protocol.persistent_server or not self.protocol.done or self.pending:
            return False
        if not self.stdin.closed:
            self.stdin.close()
        self.completed_at = self.completed_at or now
        if now - self.completed_at > 2 and self.proc.poll() is None:
            # A completed turn permits explicit shutdown of our owned stdio server.
            self.worker.expected_shutdown = True
            return True
        return False

    def _write_input(self):
        try:
            self.pending = self.pending[os.write(self.stdin.fileno(), self.pending[:65536]):]
        except BrokenPipeError as exc:
            raise AgentError("provider closed input before accepting the request") from exc
        if not self.pending:
            self.selector.unregister(self.stdin)
            if not self.protocol.persistent_server:
                self.stdin.close()

    def _read_output(self, key):
        stream = key.data
        data = os.read(key.fileobj.fileno(), 65536)
        if not data:
            self.selector.unregister(key.fileobj)
            if self.buffers[stream] and stream == "stdout":
                raise AgentError("provider ended with a truncated JSON frame")
            return
        self.worker.last_activity = time.monotonic()
        self.worker.state["provider_activity_at"] = time.time()
        self.buffers[stream] += data
        if len(self.buffers[stream]) > 16000000:
            raise AgentError("provider frame exceeds 16 MB")
        while b"\n" in self.buffers[stream]:
            line, self.buffers[stream] = self.buffers[stream].split(b"\n", 1)
            if line.strip():
                self._frame(stream, line)

    def _frame(self, stream, line):
        if stream == "stderr":
            self.worker.emit("diagnostic", message=line.decode(errors="replace")[:3000])
            return
        self.protocol.accept(json.loads(line))
        if self.protocol.pending:
            was_empty = not self.pending
            self.pending += b"".join(self.protocol.pending)
            self.protocol.pending.clear()
            if was_empty:
                self.selector.register(self.stdin, selectors.EVENT_WRITE, "stdin")

    def _wait_exit(self):
        if self.protocol.persistent_server and self.protocol.done:
            return None
        while self.proc.poll() is None:
            issue = self.worker.interrupted()
            if issue:
                return issue
            self.worker.heartbeat()
            time.sleep(.2)
        return None
