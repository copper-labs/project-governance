#!/usr/bin/env python3
"""Run the packaged dependency-freshness checker through its stable CLI entrypoint."""

from __future__ import annotations

import sys

from dependency_runner import main


if __name__ == "__main__":
    sys.exit(main())
