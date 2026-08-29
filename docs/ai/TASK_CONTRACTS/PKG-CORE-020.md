# PKG-CORE-020 — Attributable market assessment contract

## Objective

Represent competitor observations, delivery risks, and a proposed minimum viable product in one explicit, attributable, deterministic record.

## Invariants

- Competitor observations and risks require one or more evidence IDs; unsupported assertions are rejected.
- Risk severity is descriptive input (`LOW`, `MEDIUM`, or `HIGH`), not a hidden release decision.
- The MVP proposal retains caller-supplied problem, proposition, and scope; it does not choose product policy or authorize delivery.
- Output ordering is stable and all nested records are immutable.
- The module performs no AI call, network access, persistence write, publication, or delivery action.
