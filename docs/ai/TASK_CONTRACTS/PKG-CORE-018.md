# PKG-CORE-018 — Claim classification boundary

## Objective

Classify intelligence claims explicitly so AI inference cannot silently appear as verified fact.

## Invariants

- Supported types are `FACT`, `DERIVED_METRIC`, `AI_ANALYSIS`, `AI_HYPOTHESIS`, and `UNKNOWN`.
- `FACT` requires one or more attributable evidence IDs.
- AI classifications may not declare themselves verified.
