---
name: design-execution-plan
description: Transform complex or long-running goals into structured execution plans with explicit constraints, non-goals, milestones, dependencies, task inputs and outputs, acceptance criteria, risks, authorization gates, checkpoints, recovery rules, and stop conditions. Use for multi-stage research, implementation, migration, evaluation, investigation, rollout, or any task that cannot be completed reliably in one step. This skill plans work only; it never executes the plan.
---

# Design Execution Plan

Produce a plan that another agent can execute and an independent auditor can verify.
Do not execute any task from the plan.

## Required references

Read only what the request needs:

- Read [references/plan-contract.md](references/plan-contract.md) for every plan.
- Read [references/decomposition-rules.md](references/decomposition-rules.md) when splitting work or building dependencies.
- Read [references/risk-and-recovery.md](references/risk-and-recovery.md) for external writes, long-running work, destructive actions, credentials, approvals, retries, or recovery.
- Use [references/execution-plan.schema.json](references/execution-plan.schema.json) as the output contract.

## Workflow

1. Restate the concrete objective without broadening it.
2. Extract explicit constraints, non-goals, resources, deadlines, permissions, and success criteria.
3. Record assumptions separately. Never silently convert an assumption into a fact.
4. Ask only when a missing answer materially changes scope, authorization, or irreversible actions. Otherwise select a conservative assumption and expose it.
5. Decompose the objective into observable milestones and atomic tasks.
6. Give every task explicit inputs, outputs, dependencies, acceptance criteria, risk level, and authorization requirement.
7. Add checkpoints at irreversible boundaries and after meaningful groups of tasks.
8. Add recovery rules for timeouts, partial results, restarts, stale state, and unavailable dependencies when applicable.
9. Add stop conditions for success, unsafe state, exhausted retries, invalid assumptions, and missing authority.
10. Validate the final JSON before claiming the plan is complete.

## Planning rules

- Preserve the user's objective and declared non-goals.
- Use a directed acyclic dependency graph. Every dependency must reference a real task.
- Prefer tasks that can be independently verified from their outputs.
- Write acceptance criteria as observable pass/fail statements, not intentions such as "ensure quality".
- Keep execution details at the lowest level that materially reduces ambiguity.
- Require explicit authorization for destructive actions, production mutations, sending messages, publishing, payments, credential changes, and other consequential external effects.
- Include rollback only when rollback is actually possible. Otherwise define containment and recovery.
- Do not invent access, tools, people, deadlines, data, or infrastructure.
- Do not hide blockers inside assumptions.

## Output

Return one `ExecutionPlan` object conforming to
[references/execution-plan.schema.json](references/execution-plan.schema.json).

When a writable workspace is explicitly provided, save the object as
`execution-plan.json`; otherwise return it in the response. Validate a saved plan with:

```bash
node scripts/validate-plan.mjs /absolute/path/execution-plan.json
```

If validation fails, correct the plan and rerun the validator. Never report a valid plan
without a zero exit code when the validator is available.

## Boundary

This skill does not execute tasks, modify external systems, monitor progress, judge an
execution, or rewrite evidence. Use `audit-execution-evidence` to audit a completed or
partially completed execution.
