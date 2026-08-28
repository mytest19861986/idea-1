# PKG-CORE-004 — Auditable source-registry persistence

## Objective

Persist source registry records and lifecycle decisions locally with an append-only audit trail.

## In scope

- Atomic JSON-file persistence suitable for local development.
- Source creation, lookup, listing, and lifecycle transition persistence.
- Append-only audit events for all state changes.
- Tests covering persistence, auditability, and duplicate rejection.

## Out of scope

- Database server, migrations, API endpoints, collectors, and concurrent multi-process coordination.

## Invariants

- Source IDs are unique.
- Registry writes replace the complete snapshot atomically.
- Every persisted mutation writes a corresponding audit event.
- Lifecycle transitions use the domain transition guard.
