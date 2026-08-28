# PKG-CORE-008 — Evidence and traction foundation

## Objective

Capture attributable observations and derive transparent, deterministic traction signals without AI inference or external network access.

## Invariants

- Each evidence record names an opportunity, source, collected item, HTTPS URL, observation time, evidence type, strength, and confidence.
- Strength and confidence are bounded numeric observations from 0 through 100.
- Traction is a weighted descriptive aggregate, not a prediction or a product decision.
- Results are deterministic, sorted, immutable, and retain their source-count and evidence-count provenance.
