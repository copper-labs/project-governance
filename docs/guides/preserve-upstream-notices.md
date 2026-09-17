---
id: guide.preserve-upstream-notices
title: Preserve Upstream Notices
type: guide
status: current
owner: project-governance
created: 2026-09-09
updated: 2026-09-09
summary: Preserve verified upstream license and notice bytes during formatting validation.
---

# Preserve Upstream Notices

The formatter normally rejects trailing whitespace in selected text files. There is no existing
format waiver in 2.6.4. The preservation registry described here requires runtime 2.6.5 or later;
adding it to an older installation does not grant an exemption.

## Register Exact Upstream Bytes

Keep the upstream file unchanged. Verify it against the intended upstream revision, then calculate
its SHA256 with `shasum -a 256 <repository-relative-path>`. Create the adopter-owned file
`config/policies/format-preserved-notices.json` with this structure:

```json
{
  "version": 1,
  "notices": [
    {
      "path": "vendor/library/LICENSE",
      "sha256": "<64 lowercase hexadecimal characters from the verified file>",
      "source": "https://example.org/library/blob/<immutable-revision>/LICENSE"
    }
  ]
}
```

Replace all example values with the actual notice path, digest, and upstream HTTPS source URL.
Review the source and hash together. The checker verifies local bytes against the recorded digest;
it does not download the URL or establish upstream authenticity. Record a new reviewed digest when
updating the dependency. Do not trim upstream whitespace to satisfy formatting.

## Scope And Failure Behavior

- Entries name exact, normalized repository-relative paths. Wildcards, duplicate paths, traversal,
  symlinks, malformed hashes, and missing files fail validation.
- Only filenames beginning with `LICENSE`, `LICENCE`, `COPYING`, or `NOTICE` qualify. An optional
  suffix must start with `.`, `_`, or `-`; examples include `LICENSE.MIT` and `COPYING.MPL2`.
- Every registered notice is verified whenever the format check runs, even when only the registry
  changed. A byte mismatch blocks the check, including changes that remove trailing whitespace.
- Only selected files with verified matching bytes skip whitespace checks. Other `.txt` files and
  source files retain normal checks. JSON results list the skipped paths in `preserved_notices`.
- Registry and notice reads use the runtime's validation subject. Staged checks use staged bytes
  and the base tree; unstaged edits cannot change their preservation decision. Direct replay
  without a runtime packet reads the registry and notices from its current workspace.
- Each registry or notice file is limited to 1 MiB. Preservation affects formatting only.

The registry does not expand file selection. In 2.6.4, normal format selection includes `LICENSE`
and `.txt` files but excludes `COPYING.MPL2` and `LICENSE.MIT`. Explicit
`--governance-selection-file` replay inputs bypass that filename filter and can report whitespace
in those names. If those exact names fail under ordinary selection, retain the command, selected
inputs, and installed wheel identity to identify the caller or selection difference.

Run the ordinary affected check after adding the registry:

```sh
project-governance check --pack format --stage pre-commit --mode impacted
```

The `.json` registry itself already matches the format pack. License filenames outside normal pack
selection do not independently trigger a run; an explicit format check verifies their registry
entries. Keep that distinction when arranging dependency-update checks.
