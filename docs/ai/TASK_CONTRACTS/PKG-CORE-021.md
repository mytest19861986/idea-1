# PKG-CORE-021 — Observable domain-event contract

## Objective

Create a safe, deterministic event envelope for observable application lifecycle events without introducing a logging backend or exposing payload data.

## Invariants

- Every event has an explicit type, occurred-at timestamp, and correlation ID.
- Only scalar metadata values are accepted; nested objects, credentials, and arbitrary payload bodies are rejected.
- Metadata keys that suggest secret material are rejected.
- The event envelope is immutable and has no I/O side effect.
