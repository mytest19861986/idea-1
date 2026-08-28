# PKG-CORE-006 — Collector normalization boundary

## Objective

Convert collected source payloads into a small, versioned internal record without fetching remote data.

## Invariants

- A collected item always has a non-empty source ID, title, and HTTPS URL.
- Missing external identities are deterministically derived from the canonical URL.
- Output schema version is explicit and immutable.
- Raw collector payloads are never persisted by this boundary.
