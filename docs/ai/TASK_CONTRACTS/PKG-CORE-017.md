# PKG-CORE-017 — Deterministic opportunity ranking

## Objective

Rank scored opportunities predictably without altering their scores or publication state.

## Invariants

- Every item has a unique non-empty opportunity ID and bounded numeric score.
- Higher score ranks first; equal scores break by ascending opportunity ID.
- Output is immutable and carries an explicit one-based rank.
