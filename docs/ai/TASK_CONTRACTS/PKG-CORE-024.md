# PKG-CORE-024 — Collector batch boundary

## Objective

Define a source-isolated boundary for collector output batches that feeds the existing collected-item normalization contract without performing collection itself.

## Invariants

- A batch has one explicit source ID and valid collection timestamp.
- Each raw item is normalized by the existing HTTPS-only collected-item boundary.
- Empty batches are valid observations; duplicates are retained for the separate deduplication stage.
- The boundary performs no HTTP request, source activation, persistence write, retry, or lifecycle mutation.
