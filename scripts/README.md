# Source Scripts

The public command surface is the `project-governance` CLI distributed by the standard Python
wheel. This directory contains only small source-maintenance utilities that are not a public
runtime interface.

Use the runtime commands instead of invoking copied check scripts:

```sh
project-governance init
project-governance doctor
project-governance plan --stage <stage> --mode impacted --json
project-governance check --stage <stage> --mode impacted
project-governance check --pack <pack-id>
project-governance update --to <version> --dry-run
project-governance telemetry status
```

For this source checkout, use `tools/run-source-governance.sh` after installing
`requirements-dev.txt`. `tools/verify-runtime-wheel.py` is the release-boundary smoke proof: it
installs a built wheel into a clean temporary environment, initializes a synthetic repository,
runs doctor, and proves passing, failing, and unmapped selections.
