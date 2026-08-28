# PKG-CORE-005 — Source discovery candidate intake

## Objective

Convert discovered source hints into validated `CANDIDATE` records without network access or automatic approval.

## Invariants

- Only HTTPS URLs are accepted.
- IDs are derived deterministically from hostnames.
- A known base URL is not admitted twice.
- Intake always creates a `CANDIDATE`, never an `APPROVED` or `ACTIVE` source.
