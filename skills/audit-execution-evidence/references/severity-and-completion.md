# Severity and completion

## Severity

- `critical`: unsafe completion, destructive consequence, credential exposure, or core objective is
  falsely reported complete.
- `high`: required outcome is absent, a major acceptance criterion fails, or evidence is materially
  contradictory.
- `medium`: partial coverage, recoverable quality problem, or important non-blocking omission.
- `low`: presentation, efficiency, or minor traceability issue that does not change completion.

## Completion verdict

- `complete`: every required criterion is verified.
- `partial`: meaningful progress exists but one or more required criteria are not verified.
- `failed`: evidence shows the objective or a required criterion failed.
- `blocked`: execution correctly stopped on an unresolved external dependency or missing authority.
- `insufficient_evidence`: execution may have succeeded, but the supplied evidence cannot establish it.

Do not average away a critical failure. One blocking requirement is sufficient to deny completion.
