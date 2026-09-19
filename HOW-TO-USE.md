---
id: how-to-use
title: How To Use It
type: guide
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Plain-language walkthrough with real output.
---

# How To Use It

## Does it need installing?

No. It is already on your Mac at `~/ORGANTA/project-harness`. There is nothing to build and no
packages to download — it has no dependencies.

It needs **Node 22.18 or newer**. Check yours:

```sh
node -v
```

If that says `v22.18` or higher, you are ready. If not, or if the command is not found:

```sh
brew install node
```

The `harness` command checks this for you and tells you what to do if the version is wrong.

## Make the command easy to type

```sh
echo 'export PATH="$HOME/ORGANTA/project-harness/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
harness help
```

Without that, type the full path: `~/ORGANTA/project-harness/bin/harness help`.

## What it stores, and where

It keeps a small database in a `.harness` folder inside whatever repo you run it from. Add that to
that repo's `.gitignore`, or point it elsewhere with `--db <path>`.

## The one command that matters

Run this **once in each repo you work in**:

```sh
cd ~/COPPERLABS/portal-webapp
harness init
```

That writes a short block into that repo's `AGENTS.md` telling Codex to use the harness. From then
on you work exactly as you do today — you talk to Codex, Codex calls the harness. You do not type
harness commands.

It only touches instruction files that already exist, it leaves everything the team wrote around
its block alone, and running it twice changes nothing.

## The commands below are for inspecting, not for driving

Everything after this point is how *you* look at what the harness recorded, or how you verify it
works. It is not the workflow. The workflow is: talk to Codex.

## A real walkthrough

Every block below is actual output.

### 1. Start a job

Run this from inside the repo you are working in.

```sh
harness task create \
  --outcome "find out why the migration-prefix check is failing" \
  --constraint "do not change any code, just investigate" \
  --scope "$PWD"
```

It returns the job, including a `taskId`. Keep that id — every other command takes it.

```json
{ "ok": true, "task": {
    "taskId": "cdd91634-f051-445b-a15e-2988188bd966",
    "outcome": "find out why the migration-prefix check is failing",
    "status": "open",
    "items": [
      { "kind": "constraint", "provenance": "operator", "body": "do not change any code, just investigate" },
      { "kind": "scope", "provenance": "operator", "body": "/Users/stacy/COPPERLABS/portal-webapp" }
    ] } }
```

`provenance: operator` means **you** said it. Nothing the AI later suggests can overwrite it.

Forgotten the id? `harness task list`.

### 2. Run a check and keep the receipt

```sh
harness check run --task <id> --claim "the migration prefix check passes" \
  --subject HEAD -- npm run check:migration-prefixes
```

```json
{ "ok": false, "exitCode": 1, "durationMs": 59,
  "establishes": "the declared checks failed on subject HEAD",
  "confirmation": "refuted",
  "receipt": "sha256:6c56b838dadedf8097ed74dfc2a8b4fca80b741548f378ce750dac24b893601c" }
```

Anything after `--` is your own command; it is run unchanged. The full output is kept under that
receipt id, so nobody has to re-run it to find out what happened.

### 3. See what it recorded

```sh
harness task show --task <id>
```

```
job     : find out why the migration-prefix check is failing
status  : open      <- a passing check is not the job being done
actions : [('check', 'completed')]
evidence: refuted
           the declared checks failed on subject HEAD
cost    : {'calls': 1, 'durationMs': 59}
```

The job stays `open` after a check passes. Checks passing is not the same as the thing you asked
for being done, and the harness will not conflate the two.

### 4. Fetch a file at an exact version

```sh
harness context get --task <id> --at HEAD --path config/ci-impact-map.json
```

```json
{ "ok": true,
  "artifacts": [ { "path": "config/ci-impact-map.json", "bytes": 62885,
                   "subject": "tree:a87de8bad6439ba02c6717dfd61b969ef78c9213" } ],
  "budget": { "maxBytes": 262144, "usedBytes": 62885 } }
```

`--at HEAD` means the committed version. `--at staged` means what you have staged. This matters:
if your editor has unsaved changes, those are *not* what an AI should be reasoning about unless you
say so.

The budget belongs to the job, not the request. Ask again and the second request sees what the
first spent — so a long investigation cannot quietly consume an unbounded amount of context.

### 5. It refuses work outside the job

```sh
harness context get --task <id> --at HEAD --path ../asensei-mnemos/README.md
```

```json
{ "ok": false,
  "refused": "outside the task's scope: ../asensei-mnemos/README.md",
  "scope": ["/Users/stacy/COPPERLABS/portal-webapp"] }
```

This is the point of the thing. You said the job covers one repo, so it will not reach into another.

### 6. After a crash

```sh
harness recover
```

If something was interrupted mid-run, this looks at what actually happened on disk. If it can tell,
it corrects the record. If it cannot, it says `outcome-unknown` and stops, rather than guessing or
re-running something that may already have taken effect.

### 7. Costs

```sh
harness usage --task <id>
harness export > snapshot.json
```

`export` dumps everything as readable JSON.

## When two chats share one folder

Forking a chat "in this workspace" gives both threads the same folder and the same branch. They can
overwrite each other's edits, and git cannot help — it is one branch in one checkout.

The harness will not stop that. It does not write files, so it never sees the write, and a lock
would be a promise it cannot keep. What it does is tell you quickly:

```
Another active session in this worktree has touched src/export.ts.
You share one folder and one branch, so edits can overwrite each other.
```

If the branched thread is only exploring — working out an approach, writing a spec — create its job
with `--exploring`. A job that changes nothing cannot collide with one that does, so it is left
alone rather than nagged about.

```sh
harness status          # who else is working in this folder right now
```

**Practice worth keeping:** share a workspace for exploring, use a new worktree for implementing.

## What it does not do

**It does not edit your code.** Codex still does that. The harness reads, runs checks you name, and
records. If it is wrong, you get a wrong note — never a mangled file.

## The whole command list

```
harness init
harness task create   --outcome <text> [--constraint <text>]... [--scope <path>]... [--exploring]
harness task show     --task <id>
harness task list     [--all]
harness task fork     --task <id> [--outcome <text>] [--exploring]
harness status        [--task <id>]
harness task revise   --task <id> [--constraint <text>]... [--note <text>]... [--revoke <seq>]...
harness context get   --task <id> [--at staged|worktree|<rev>] [--path <p>]... [--budget <bytes>]
harness check run     --task <id> --claim <text> [--subject <rev>] -- <command> [args...]
harness recover
harness usage         [--task <id>]
harness export
```
