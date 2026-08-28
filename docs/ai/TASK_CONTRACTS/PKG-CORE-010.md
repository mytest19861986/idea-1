# PKG-CORE-010 — Localization template boundary

## Objective

Render a pre-approved localized template deterministically without machine translation or silent locale fallback.

## Invariants

- A locale, message key, and string template must be explicitly present in the catalog.
- Every template placeholder must receive a scalar string, number, or boolean value.
- Unexpected and missing values fail closed.
- Values are rendered as text only; this boundary produces no HTML.
