---
id: developer-guide.supplied-evidence-evaluation
title: Evaluate Supplied Text and Images
type: guide
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-07
summary: Explains the advisory evaluator, explicit disclosure and project-owned visual checkpoints being delivered in 4.2.
---

# Evaluate supplied text and images

The 4.2 evaluator asks bounded questions about text and local images. It returns probabilities,
a supplied choice or a score. Your script owns capture, interpretation and native assertions.
The evaluator cannot click, repair a task or turn a failed native assertion into a pass.

This guide describes the 4.2 development interface. Clean installed-package mechanical proof
passes in the [delivery plan](../../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md).
Independent implementation review is reconciled. Publication remains separate; installing an older
release does not provide this entry.
The [specification](../../specs/engine-decision-providers-and-image-evaluation.md) owns the contract.

## Configure one explicit evaluator

Generic evaluation is disabled by default. Existing JEV context-selection configuration does not
enable it or approve supplied evidence. A project deliberately enables one provider/model and
grants `supplied-evidence` disclosure, including written questions, text and image roles.

```yaml
continuity:
  decisions:
    allowed_data_classes: [supplied-evidence]
    mode: auto
    evaluation:
      enabled: true
      provider: openai
      model: gpt-6-luna
      allowed_artifact_roots: [artifacts/visual]
      daily_budget:
        max_calls: 500
        max_request_bytes: 1073741824
```

The existing global `mode: off` switch disables registered and supplied decisions. Set the master
mode deliberately; `evaluation.enabled` selects this operation, while existing consumer declarations
still select registered questions. These daily values illustrate an explicit project allowance; they do not automatically enable a
provider or guarantee a dollar ceiling. Merge the disclosure class into the project's existing
grant rather than replacing other approved classes. Keep `OPENAI_API_KEY` in the host environment.
JEV accepts generic text; images on that explicitly selected provider return unsupported without
switching to OpenAI. A `localOnly` request cannot use either hosted provider.

## Prepare one request

```json
{
  "version": 1,
  "evaluationId": "settings-checkpoint-001",
  "evidence": [
    {"id": "actual", "type": "image", "path": "artifacts/visual/settings.png", "role": "actual"}
  ],
  "questions": [
    {"name": "saved-state-visible", "type": "predicate", "instructions": "Is the selected notification setting visibly enabled?"}
  ]
}
```

Run it through the pinned repository entry:

```sh
project-governance evaluate --request-file evaluation.json
```

The narrow library entry is `@organta/project-governance/evaluation/v1`, exporting
`evaluateEvidence(request, {workspace})`. It exposes evaluation, not task or execution authority.
The request is version 1; the result uses the shared version-3 outcome envelope.
Task association is optional verified provenance. Standalone calls do not create or select a task.

Use static PNG, JPEG or WebP files within approved artifact roots. The runtime captures immutable
bytes and checks media, dimensions and request size. It does not fetch, resize or crop images.
Use workspace-relative or canonical absolute paths; symlinked system aliases are not admitted.
For comparisons, supply named actual/reference evidence and state the criteria. All questions
share the same supplied evidence; names do not isolate one image from other questions.

## Interpret and retain the result

Read the JSON result on both exit codes. Exit 0 permits answered, unknown and refused outcomes;
it does not mean the UI passed. Exit 1 can retain useful sibling answers alongside failures.
Preserve missing coverage and required proof. A native failure remains a failure even when a
visual answer looks positive.

Keep the evaluation ID and original receipt link. Replaying the same ID and exact admitted input
observes its retained outcome. Changed input conflicts. An interrupted call may have reached the
provider, so its missing receipt does not authorize a second dispatch. A deliberately new ID is
a new attempt charged to the workspace's daily allowance. New processes, settings changes and
midnight do not erase the old dispatch claim.
Unrelated consumer settings and allowance changes do not change a retained request's identity.
Current admission still applies, so revoked disclosure or artifact roots deny reuse. A provider,
model, evaluator adapter version or semantic input change conflicts with the existing ID.

Custom checker commands declare `credentialEnv: [OPENAI_API_KEY]` alongside `run` and optional
`stages`. The engine forwards values only in the declaring process environment. Keep the browser
driver and a separate evaluator command apart when screenshots are captured locally.
Never embed a key in YAML, argv, request files or receipts.
For a 4.2 upgrade, remove embedded `*_API_KEY` overrides, including empty placeholders. Ordinary
environment overrides reject those names. Rejection does not make them valid credential references;
forwarding still requires an accepted declaration.

## What fixture proof establishes

Fixture providers prove admission, accounting, replay, partial answers and installed wiring.
They do not establish visual-model accuracy or savings. Required visual gates need independent
labels, matched good/bad cases and accepted workload criteria. Measure native provider usage and
whole-workflow cost, including preprocessing and follow-up calls.

The [optional computer-use plan](../../exec-plans/active/2026-10-06-optional-computer-use-testing.md)
adds a caller-owned synthetic browser pilot. Holo proposes a point; deterministic code controls
the action. Decisions evaluates frozen checkpoints afterwards. Local model setup and paid
qualification remain separate from model-free implementation.
