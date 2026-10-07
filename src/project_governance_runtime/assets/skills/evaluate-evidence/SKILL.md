---
name: evaluate-evidence
description: Ask bounded advisory questions about supplied text or local images through the installed evaluator. Use for an explicitly requested evidence assessment or a project-owned visual test checkpoint.
---

# Evaluate supplied evidence

Use the repository's pinned `project-governance evaluate --request-file REQUEST.json` command when
that installed version supports it. The version-1 request names one stable evaluation ID, ordered
evidence and uniquely named questions. For example:

```json
{
  "version": 1,
  "evaluationId": "visual-checkpoint-001",
  "evidence": [{"id": "actual", "type": "image", "path": "artifacts/checkpoint.png", "role": "actual"}],
  "questions": [{"name": "confirmation-visible", "type": "predicate", "instructions": "Is a save confirmation visible?"}]
}
```

Text evidence uses `type: text` and `text` in place of the image `path`. Choice questions add
`choices: [{value, description}]`; score questions add ordered `levels: [{label, description}]`.
All questions share the supplied evidence. The result is a version-3 outcome envelope.
The command supplies advice; it does not navigate, click, repair a test, accept a task or grant
permission. Keep ordinary bookkeeping and native assertions deterministic.

Enablement and supplied-evidence disclosure are separate prerequisites. Confirm the existing grant
covers the written questions, text, image roles/labels and local artifacts. A source-selection grant
does not approve screenshots. Keep credentials in the declared process environment, never request
files or arguments. Do not enable a provider or broaden roots/disclosure merely to make a call work.

Use local static PNG, JPEG or WebP files under the caller's approved roots. The caller owns capture,
reference images, transformations and interpretation. Preserve originals and record any evaluated
derivatives. A crop cannot establish a property outside the captured region.

Retain the evaluation ID, result and linked receipt. Parse the structured result on either exit code;
valid sibling answers can coexist with unavailable questions. Exit 0 means the evaluator returned
answered, unknown or refused outcomes, not that a visual assertion passed. Preserve unknown,
refusal and outage rather than interpreting them as approval. Native failures remain failures.

Repeat an existing ID only with the same request, provider, model and evaluator adapter version
to observe its retained outcome. An
interrupted request may have reached the provider; do not use a new ID to retry uncertain work
automatically. A deliberately new evaluation consumes the shared daily allowance.

Report what the evidence supports, its coverage limits and any missing required proof. Fixture
answers qualify wiring only. Required visual gates and savings claims need independent labels,
matched outcomes and observed total usage.
