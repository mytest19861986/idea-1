# PKG-COL-002: TrustMRR Controlled Collector Design & Invariant Contract

## 1. Context & Objective
Implement the controlled collector adapter for TrustMRR following the multi-agent evaluation in `PKG-SRC-EVAL-001`.
The collector provides structured ingestion mapping into normalized `RawDocument` objects while enforcing architectural boundaries.

## 2. Invariants
- **TRUSTMRR-G001 (Claim Boundary)**: All revenue, MRR, ARR, and financial metrics are explicitly categorized as `SOURCE_CLAIM` with provenance metadata (`verified_by`). They are never upgraded to platform `FACT`.
- **TRUSTMRR-G002 (Access Boundary)**: Maximum page limit of 10 (`API_MAX_PAGE_LIMIT`), explicit rate-limit backoff on HTTP 429 (`retryAfterMs`), no un-bounded scraping.
- **TRUSTMRR-G003 (Entity Boundary)**: Masked / confidential marketplace listings are tagged `is_confidential: true` and have external URL references stripped to prevent entity collision.

## 3. Implemented Components
- [`src/collection/trustmrr-collector.mjs`](file:///g:/project/IDEA/src/collection/trustmrr-collector.mjs): Core collector adapter, canonical URL builder, document normalizer, and error handler.
- [`test/trustmrr-collector.test.mjs`](file:///g:/project/IDEA/test/trustmrr-collector.test.mjs): Unit test suite covering deterministic identity, HTTPS URLs, confidential isolation, and HTTP error mapping.

## 4. Verification & Safety
- **Production Activation**: NO (Source candidate remains un-activated in registry).
- **Database Mutation**: NO (No direct database writes).
- **Scheduler**: NO (No cron/background daemons).
