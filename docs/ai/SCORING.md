# Scoring

The core score is an explainable weighted average over caller-supplied normalized factors. It is intentionally policy-free: the domain caller must select factors and weights, and this repository currently defines no production defaults, thresholds, or automatic publishing rule.

Each score result retains the input factor, its explicit weight, and its weighted contribution so later ranking can be audited.
