# PKG-CORE-019 — Source coverage-gap assessment

## Objective

Identify required market segments that are not covered by active sources, without mutating source lifecycle state or selecting sources automatically.

## Invariants

- Only sources whose status is `ACTIVE` contribute coverage.
- Candidate, paused, retired, and malformed source records cannot satisfy a coverage requirement.
- Segment names are trimmed; blank requested segments are ignored and duplicates are collapsed.
- The result is a sorted immutable list, making it safe to use as an auditable planning input.
- This assessment creates no source, changes no source status, and performs no network collection.
