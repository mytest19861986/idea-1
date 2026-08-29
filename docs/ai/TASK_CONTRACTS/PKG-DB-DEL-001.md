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

## Forbidden until blockers resolve

- Do not represent local JSON persistence as production-safe.
- Do not execute any migration against production.
- Do not invent a revision value or silently weaken the uniqueness constraint.
