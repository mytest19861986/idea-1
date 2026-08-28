# PKG-CORE-014 — Delivery result contract

## Objective

Represent a future adapter's delivery outcome with explicit status and attributable timing, without making a channel call.

## Invariants

- A result derives from a valid delivery request.
- Status is exactly `DELIVERED` or `FAILED`.
- A delivered result requires a channel reference; a failed result requires a non-empty failure code.
- Result creation is pure and performs no retry or external operation.
