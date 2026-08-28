# PKG-CORE-016 — Source health assessment

## Objective

Derive a transparent source-health observation from collection outcomes without changing source lifecycle state.

## Invariants

- Events must belong to exactly one source and contain a valid timestamp and boolean success result.
- Failure-rate threshold is an explicit caller-owned parameter.
- Output is deterministic and descriptive; it does not persist or transition a source.
