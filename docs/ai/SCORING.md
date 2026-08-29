# Scoring

## Trend inputs

Trend summaries are descriptive evidence inputs only. They report change in one caller-named metric and deliberately do not label an outcome as good or bad, supply a scoring weight, or change an opportunity score.

The core score is an explainable weighted average over caller-supplied normalized factors. It is intentionally policy-free: the domain caller must select factors and weights, and this repository currently defines no production defaults, thresholds, or automatic publishing rule.

Each score result retains the input factor, its explicit weight, and its weighted contribution so later ranking can be audited.
