# Execution plan contract

## Inputs

Accept a user objective plus any available constraints, non-goals, resources, deadlines,
permissions, existing artifacts, and success criteria. Preserve source wording where a small
change would alter scope or authority.

## Output invariants

- `objective` states one concrete outcome.
- Constraint IDs, assumption IDs, milestone IDs, task IDs, checkpoint IDs, recovery IDs, and
  stop-condition IDs are unique within their collections.
- Every milestone references at least one task.
- Every task has an observable output and at least one acceptance criterion.
- Every dependency references another task and the graph is acyclic.
- Critical or high-risk actions expose authorization requirements.
- `final_acceptance` is sufficient to decide whether the objective is achieved.

## Quality test

A plan is ready only when an executor can identify the next eligible task and an auditor can
decide completion without reconstructing unstated intent.
