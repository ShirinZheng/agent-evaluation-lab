# Decomposition rules

## Task boundaries

Split work when any of these changes:

- required tool or authority;
- owner or environment;
- reversible versus irreversible state;
- input provenance;
- output artifact;
- acceptance method;
- retry or rollback behavior.

Do not split purely to inflate task count. Keep tightly coupled atomic operations together when
they share one output and one acceptance check.

## Dependencies

Use dependencies only for real prerequisites. Parallel work should not be serialized without a
reason. A task must not depend on its descendants.

## Acceptance criteria

Prefer exact predicates such as:

- a named file parses against a named schema;
- all required IDs appear exactly once;
- a command exits zero and its output contains an expected invariant;
- a reviewer can trace every conclusion to a source artifact.

Avoid subjective-only criteria unless the task is inherently qualitative; in that case name the
rubric and reviewer.
