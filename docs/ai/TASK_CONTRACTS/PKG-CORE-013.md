# PKG-CORE-013 — Controlled delivery request contract

## Objective

Create validated delivery requests for future Web and Telegram adapters without performing delivery.

## Invariants

- Only explicitly `APPROVED` publication records may request delivery.
- A request names one supported channel, an idempotency key, and a timestamp.
- A request is a data object only; it has no network or storage side effect.
- Adapters must emit their own delivery result and audit event later.
