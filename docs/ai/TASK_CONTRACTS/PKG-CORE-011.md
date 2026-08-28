# PKG-CORE-011 — Publication-ready opportunity record

## Objective

Create a deterministic, provenance-preserving record that a future delivery adapter can render, without permitting automatic publication.

## Invariants

- A record requires a stable opportunity ID, localized text, bounded score, a timestamp, and one or more attributable citations.
- Each citation has a source ID, collected-item ID, and HTTPS URL.
- Citation identity is unique per `(sourceId, collectedItemId)` pair and is canonically ordered.
- This boundary always returns `DRAFT`; publishing remains an explicit future action.
