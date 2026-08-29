# Database

## Current state

No database server, database client dependency, migration tool, schema, connection configuration, or database integration test exists in this repository.

Local JSON snapshots are development-only test infrastructure. They are not an authoritative production store and do not provide cross-process locking or transactional idempotency.

## Approved direction for delivery persistence

Commander direction for `PKG-DEL-001` is a layered PostgreSQL design:

```text
Core contracts → delivery persistence abstraction → PostgreSQL adapter
```

Required persistent concepts are `DeliveryRequestRecord`, `DeliveryIdempotencyRecord`, `DeliveryAttempt`, and `DeliveryResultRecord`. The production unique identity must cover publication revision, channel, and idempotency key. PostgreSQL availability is not yet verified in this workspace, so database integration and migration gates are currently unproven.

## Safety rules

- No production migration may run from this repository until a target environment and approval path exist.
- Migrations must be additive, versioned, reviewable, and tested against a disposable database.
- Database URLs, credentials, and TLS material are secrets and must never enter source control.

## PKG-DB-DEL-001 blocker

The existing delivery-request contract does not include the required `publicationRevision` component. A PostgreSQL adapter must not invent that value or weaken the production uniqueness key. This contract gap and the absence of a disposable PostgreSQL environment block implementation and integration verification; they do not make the local JSON adapter production-safe.
