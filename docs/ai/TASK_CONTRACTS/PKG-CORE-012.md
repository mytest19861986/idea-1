# PKG-CORE-012 — Explicit publication authorization

## Objective

Move a complete publication record from `DRAFT` to `APPROVED` only with an explicit, attributable approval event.

## Invariants

- Only an unmodified `DRAFT` record may be approved.
- An approval requires actor, reason, and timestamp supplied by the caller.
- Approval creates a deterministic audit event.
- Approval is not dispatch: no web, Telegram, network, or side effect occurs.
