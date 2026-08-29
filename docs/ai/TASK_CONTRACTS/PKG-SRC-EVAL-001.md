# PKG-SRC-EVAL-001 — TrustMRR source evaluation

## Objective

Evaluate TrustMRR as a source candidate only after permitted evidence is collected. This contract grants no network access and makes no approval decision.

## Required evidence

- signal quality and revenue-claim provenance;
- freshness, uniqueness, geography/category coverage;
- crawl and access feasibility, terms, and rate limits;
- data-structure stability and promotional-bias risk.

## Decision discipline

The Source Registry remains authoritative. A candidate is not trusted, active, or collectible merely because this evaluation exists. Approval requires attributable evidence and an explicit lifecycle transition.

## Exclusions

No HTTP/RSS request, Playwright, source activation, collector runtime, queue, database, Gemini call, or production collection.
