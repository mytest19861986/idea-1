# Decisions

## D-001: Modular monolith baseline

Recorded in ADR 0001. Boundaries are explicit but no microservice split is introduced.

## D-002: Deterministic core before external adapters

Current collection, evidence, scoring, publication, and delivery-request/result logic is dependency-free and side-effect-free where possible. No external publisher has been added.

## D-003: PostgreSQL direction for production delivery state

Commander directed `PKG-DEL-001` to use a persistence abstraction backed by PostgreSQL, not local JSON, for authoritative production idempotency and delivery attempts. This remains unimplemented pending migration design and environmental verification.
