# PKG-DB-DEL-001 — PostgreSQL delivery idempotency persistence

## Objective

Persist authoritative delivery requests, idempotency claims, attempts, and results transactionally in PostgreSQL.

## Required production identity

`(opportunityId, publicationRevision, channel, idempotencyKey)`

## Current repository blockers

- No PostgreSQL server, client dependency, database URL, or disposable integration environment is available in the workspace.

## Required before implementation acceptance

- Additive, reviewable migration design with rollback/deployment ordering.
- PostgreSQL integration environment and concurrency tests proving transactional duplicate handling.
- Security review of connection configuration and secret injection.

## Current design status

- `SCHEMA_DESIGNED`: `database/migrations/0001_delivery_persistence.sql` is additive and unexecuted.
- `HARNESS_PREPARED`: canonical identity has pure tests for revision/channel separation and malformed input.
- `DB_INTEGRATION_NOT_EXECUTED`: PostgreSQL behavior and concurrency remain unverified.
- `POSTGRES_ENVIRONMENT_BLOCKED`: no disposable server or client is available.

## Forbidden until blockers resolve

- Do not represent local JSON persistence as production-safe.
- Do not execute any migration against production.
- Do not invent a revision value or silently weaken the uniqueness constraint.
