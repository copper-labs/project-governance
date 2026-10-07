---
id: fixture.optional-computer-use
title: Caller-owned computer-use experiment fixture
type: reference
status: current
owner: project-governance
created: 2026-10-07
updated: 2026-10-07
summary: Documents model-free browser qualification and separate local grounding/evaluation setup boundaries.
---

# Caller-owned computer-use experiment fixture

This directory is a portable caller example and contract-test fixture. It is excluded from the
compiled runtime archive. A project deliberately copies/adapts it into its own test setup and owns
Playwright, a supported browser, ignored local configuration and its artifact directory. Normal
governance installation/startup does not discover or load it.

The source test invokes a real disposable browser with injected grounding coordinates. That proves
browser mechanics and native fault detection. It does not prove Holo localization, Decisions visual
accuracy, provider availability, cost savings or a required visual gate.

## Files and execution

- `holo.ts`: explicit llama.cpp wire profile, literal-loopback admission, bounded image-to-point
  transport and strict integer coordinates. Passive inspection makes no requests.
- `runner.ts`: retained capture geometry, generation token, finite budget, flushed action intent and
  one dispatch followed by readback. Lost acknowledgment cannot trigger another mutation.
- `browser.ts`: local synthetic form/preferences/canvas app and a caller-owned browser driver.
  Navigation/network are restricted to one fixture origin; service workers and extra pages are blocked.
- `scenarios.ts`: fixed scripts, native assertions and immutable checkpoints. Post-run paired reports
  never change native results. Captures remain unlabeled until an independent labeler supplies truth.
- `evaluate.ts`: separate installed evaluator invocation, partial-answer parsing and frozen-image
  provenance. It contains no hosted provider client. Only its explicitly declared child receives the key.
- `command.ts`: selected custom-check output. Optional absence emits warning plus advisory not-run;
  required absence emits blocking failure. Invalid selected configuration blocks either lane.

Use Node `>=24.16.0 <25`. Invoke the example directly from a caller-owned custom-check command:

```sh
node path/to/command.ts --run-id ui-experiment --mode inspect --config path/to/ignored-holo.json
```

Omitting configuration honestly reports optional not-run. Add `--required` only for an explicitly
required proof. `--disabled` skips configuration inspection. No operation downloads weights, starts
a service or falls back to another provider. The driver/browser environment retains only PATH and
temporary-directory variables; an OpenAI credential belongs solely to a separate evaluator child.

The model-free source checkpoint is:

```sh
OPTIONAL_PILOT_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
OPTIONAL_PILOT_CHROMIUM=/absolute/path/to/installed/chromium \
OPTIONAL_PILOT_SHARP=/absolute/path/to/sharp/dist/index.mjs \
OPTIONAL_PILOT_EVIDENCE=/absolute/path/to/existing/evidence-directory \
node --test components/engine/test/optional-computer-use.test.ts
```

The Playwright module/browser paths are explicit caller bindings. No automatic dependency scan or
download runs. Without these bindings, only the browser cases are skipped; that invocation cannot
claim browser qualification. Every test uses a fresh fixture and browser context and closes both.
Sharp is a caller-only dependency for the frozen-image preparation case; absent bindings skip that
case explicitly. Named artifacts and original TAP results belong outside source. Device scale 2, known generation
changes, blocked other origins, exactly-once submission and lost acknowledgment are exercised.

## Ignored local Holo configuration

The selected client requires all fields below. Replace the illustrative strings with inspected
identities; digests identify exact local artifact bytes, not a model alias or remote repository name.

```json
{
  "endpoint": "http://127.0.0.1:8080/v1",
  "model": "holo4-27b",
  "revision": "exact-selected-model-revision",
  "quantization": "Q4_K_M",
  "modelSha256": "actual-64-character-lowercase-sha256",
  "projectorSha256": "actual-64-character-lowercase-sha256",
  "runtime": "llama.cpp",
  "runtimeVersion": "actual-inspected-build-version",
  "deadlineMs": 45000
}
```

Readiness is an explicitly invoked, bounded GET of the served models list:

```sh
node path/to/command.ts --run-id holo-readiness --mode readiness --config path/to/ignored-holo.json
```

This proves only that the configured alias is advertised. A loopback proxy and arbitrary alias do
not attest to loaded weights or local processing. Screenshot compatibility is a separate explicit
operation using caller-approved synthetic evidence:

```sh
node path/to/command.ts --run-id holo-smoke --mode smoke --config path/to/ignored-holo.json \
  --screenshot path/to/synthetic-capture.png --target 'Submit contact button below the address field'
```

That proves a valid image response only. The browser runner/oracle must separately establish that
the proposed point activates the intended control. Boundary coordinate 1000 maps outside the
half-open viewport and is rejected; the runner never clamps it into a valid click.

## Local model setup remains a separate checkpoint

No selected llama.cpp binary or Holo weights were available during model-free delivery. There is
therefore no tested Holo4 start command in this runbook. Before a separately authorized setup:

1. Inspect the selected `llama-server --version` and `--help`, model revision/digest, Q4 file and
   matching projector digest. Verify Holo4/Qwen3.5 image support in that exact runtime build.
2. Check the actual binary supports the source-documented `--model`, `--mmproj`, `--host`, `--port`,
   `--alias` and the selected JSON-schema/chat-template fields. Do not borrow Holo3.1 speed flags.
3. Start only a specifically authorized command bound to `127.0.0.1` using explicit local artifact
   paths. Record actual configuration and resource usage. No `--hf` auto-download is part of this caller.
4. Run passive inspection, explicit readiness and synthetic screenshot/browser smoke separately.
   Record failures as well as success. Stop only the specifically recorded test server on teardown.

The adapter currently sends `response_format: {type: "json_schema", schema: ...}` and
`chat_template_kwargs: {enable_thinking: false}` with temperature zero. This profile follows the
[llama.cpp server contract](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
and H Company's [localization contract](https://hub.hcompany.ai/models-api/element-localization).
The [local-inference guide](https://hub.hcompany.ai/models-api/local-inference) lists Holo4 GGUF
support, while its detailed throughput/start examples describe Holo3.1. These sources establish
candidate contracts, not this host's model compatibility or measured performance.

## Evaluator integration boundary

Use the delivered governance evaluator entry in a separate post-run command. Submit frozen capture
paths and written questions under an explicit supplied-evidence grant. Neither native state nor
independent correctness labels enter model requests. Parse valid envelopes on either exit code;
missing envelopes leave every requested question unavailable. Do not build a direct OpenAI client.

Original captures are immutable. Image-cost derivatives need original/derived hashes, dimensions and
transform provenance. They cannot replace Holo control geometry. A cropped image cannot establish
a property outside its crop. Paired native/visual reporting uses one action run and its frozen images,
never two browser executions presented as matched arms. Refused, unknown, unavailable and unlabeled
evidence stays visible. Native usage and cost remain unknown until original provider receipts exist.

See the [owning specification](../../../../../docs/specs/engine-optional-computer-use-testing.md)
and [plan](../../../../../docs/exec-plans/active/2026-10-06-optional-computer-use-testing.md).
