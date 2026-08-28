# PKG-CORE-007 — Deterministic collected-item deduplication

## Objective

Separate duplicate collected items from unique items before downstream analysis.

## Invariants

- A duplicate key is the exact `(sourceId, externalId)` pair.
- Items from different sources never collide solely because their external IDs match.
- Input order determines which matching record is retained.
- The operation is pure, deterministic, and does not mutate input.
