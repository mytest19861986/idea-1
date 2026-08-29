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

The delivery contract now requires a positive-integer `publicationRevision`, and its local ledger identity is `(opportunityId, publicationRevision, channel, idempotencyKey)`. PostgreSQL implementation and integration verification remain blocked by the absence of a disposable PostgreSQL environment, client dependency, and approved connection configuration. The local JSON adapter is not production-safe.

## Proposed additive migration

`database/migrations/0001_delivery_persistence.sql` is a design artifact only and has not been executed. It creates delivery requests, claims, attempts, and results without assuming an existing opportunity table. Its unique key is `(opportunity_id, publication_revision, channel, idempotency_key)` and its result check prevents mixing delivered references with failure codes. Execution requires an approved disposable PostgreSQL environment and a tested rollback/deployment plan.

### Claim ownership semantics — PKG-DB-DEL-001A

`CLAIM_MODEL=DEDICATED_TABLE`. A transaction first inserts the unique delivery request identity using `INSERT ... ON CONFLICT DO NOTHING`, then inserts or locks its one `delivery_claims` row (`FOR UPDATE`) before granting ownership. `claimed_by`, `claimed_at`, and `lease_expires_at` record ownership; only an expired non-final claim can be reassigned under the same row lock. Final claim states are terminal, so a successful delivery is never externally eligible again. Retryable failures retain the identity but allow a later lease; final failures are terminal. The PostgreSQL unique constraint and row locks—not application memory—prevent two concurrent workers from owning the same identity.
