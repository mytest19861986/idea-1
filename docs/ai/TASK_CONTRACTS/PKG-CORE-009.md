# PKG-CORE-009 — Transparent opportunity scoring contract

## Objective

Provide a deterministic scoring primitive for normalized opportunity inputs while keeping score weights an explicit caller-owned policy.

## Invariants

- Every factor and every weight is a finite 0–100 number.
- Factor and weight keys must match exactly.
- Weights must total exactly 100.
- The result exposes the normalized inputs and weighted contribution of each factor.
- This package supplies no default weights, ranking threshold, or publication policy.
