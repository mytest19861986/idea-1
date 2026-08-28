# PKG-CORE-015 — Persistent delivery idempotency guard

## Objective

Persist accepted delivery-request identities before adapters exist, preventing a single local process from accepting duplicate channel requests.

## Invariants

- Identity is the exact `(channel, idempotencyKey)` pair.
- The first claim is persisted atomically before it is returned as accepted.
- A repeat claim returns the original immutable claim and is not re-accepted.
- The local JSON implementation has no multi-process/distributed lock guarantee; production delivery must replace it with transactional infrastructure.
