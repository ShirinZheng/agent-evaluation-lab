# Risk and recovery

## Risk levels

- `low`: read-only or easily reversible local work.
- `medium`: contained writes with a reliable rollback.
- `high`: external mutations, publication, coordination, sensitive data, or incomplete rollback.
- `critical`: destructive, production-wide, financial, credential, legal, or safety impact.

## Authorization

Set `authorization_required=true` for high or critical actions unless the user has already granted
specific authority for the exact target and operation. Record the authority boundary in the task.

## Checkpoints

Add a checkpoint before irreversible work, after an expensive phase, before handoff, and before
changing environments. State what must be durable and how it will be validated.

## Recovery

For each material failure mode, define detection, preserved state, safe next action, retry limit,
and escalation. A response lost after an external effect requires reconciliation before retry.
