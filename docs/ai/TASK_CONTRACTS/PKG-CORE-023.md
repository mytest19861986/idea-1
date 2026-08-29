# PKG-CORE-023 — Evidence-based trend summary

## Objective

Derive an auditable directional trend from attributable metric observations without assigning business significance or altering opportunity scores.

## Invariants

- Observations require a metric name, finite numeric value, and valid occurrence timestamp.
- The caller supplies a single metric; mixed metrics are rejected.
- Output reports first/latest values, absolute change, relative change, observation count, and ordered time bounds.
- No hidden threshold, score change, AI inference, persistence, publication, or network side effect exists.
