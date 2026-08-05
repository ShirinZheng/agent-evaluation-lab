# Audit contract

## Inputs

Accept an immutable execution plan, completion claim, trace or ordered event list, artifact index,
and optional environment metadata. Every artifact or trace event used as evidence needs a stable ID.

## Requirement inventory

Audit task acceptance criteria and final acceptance criteria. A requirement result must use one of:

- `verified`: direct, valid evidence satisfies the full criterion;
- `partial`: evidence satisfies only part of it;
- `failed`: valid evidence contradicts the criterion;
- `blocked`: an explicit dependency or authority blocker prevents a valid attempt;
- `missing_evidence`: the claim may be true, but supplied evidence cannot prove it.

## Completion invariant

`completion_allowed=true` only when the verdict is `complete`, all required criteria are verified,
all cited evidence resolves, and no critical or high blocking finding remains.
