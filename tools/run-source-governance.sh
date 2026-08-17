#!/bin/sh
# Run this checkout's governance package without creating a second source runner.
set -eu

root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

# Source development must exercise the checkout; installed child repositories use their locked wheel.
if [ -f "$root/src/project_governance_runtime/cli.py" ]; then
  if ! PYTHONPATH="$root/src" python3 -c 'import yaml' >/dev/null 2>&1; then
    echo "Governance source dependencies are unavailable. Run: python3 -m pip install -r requirements-dev.txt" >&2
    exit 1
  fi
  exec env PYTHONPATH="$root/src${PYTHONPATH:+:$PYTHONPATH}" \
    python3 -m project_governance_runtime.cli "$@"
fi

# A packaged checkout can still use the exact repository-local installation.
runtime="$root/.governance/runtime/bin/project-governance"
if [ -x "$runtime" ]; then
  exec "$runtime" "$@"
fi

echo "Governance runtime is unavailable. Run: python3 tools/governance-bootstrap.py" >&2
exit 1
