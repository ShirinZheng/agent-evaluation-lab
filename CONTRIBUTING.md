# Contributing

Thanks for helping make agent evaluation more reproducible.

## Good first contributions

- Add an adversarial or regression case with a clear failure hypothesis.
- Improve a deterministic evaluator and include positive and negative tests.
- Add a runtime adapter without weakening process isolation.
- Clarify setup, privacy, or failure-analysis documentation.

## Development setup

```bash
npm ci
npm run check
```

Changes to an evaluator should include a test that fails before the change and passes after it.
Changes to a Skill or Agent should explain the failure class being addressed and compare the same
dataset slice before and after the change.

## Pull requests

Keep each pull request focused on one primary variable: Skill, Agent, dataset, evaluator, runner, or
documentation. Include:

- the problem and a reproducible case;
- what changed and why;
- the commands used to validate it;
- before/after scores when behavior changes;
- any privacy, safety, or compatibility implications.

Do not commit credentials, `.env` files, raw production data, local Langfuse volumes, generated
artifacts, reports, or snapshots.
