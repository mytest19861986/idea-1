# PKG-COL-002: Implementation Task for GLM-5.3 (Lead Implementer)

**Package**: `PKG-COL-002`  
**Title**: TrustMRR Controlled Collector Design & Invariant Contract  
**Role**: Backend & Infrastructure Lead  
**Target Source**: TrustMRR (https://trustmrr.com)  

---

## 1. Objective & Architectural Boundaries
Design and implement the controlled TrustMRR collector adapter adhering strictly to existing repository collection contracts:
- **NO Production Activation**: The source candidate must remain un-activated.
- **NO Database Mutation**: No direct DB writes or side-effects.
- **NO Scheduler**: No timers, cron jobs, or background workers.
- **NO Bulk Crawling**: Strictly bounded pagination and single-page collection mechanics.
- **Controlled Testing Only**: Pure unit tests without mandatory live network dependencies (mockable transport).

---

## 2. Invariants & Guardrails (Mandatory)
- **TRUSTMRR-G001 — Claim Boundary**: Revenue/MRR/ARR/customer/growth values originating from TrustMRR MUST be tagged as `SOURCE_CLAIM` with provenance metadata (`provider_backed`, `verified_by`). They must NEVER be upgraded to platform-verified ground truth `FACT`.
- **TRUSTMRR-G002 — Access Boundary**: Bounded cursor/page limits, explicit rate-limit handling (20 req/min backoff with `retryAfterMs`), failure classification (`RETRYABLE`, `RATE_LIMITED`, `FINAL`).
- **TRUSTMRR-G003 — Entity Boundary**: Masked/confidential marketplace listings (where domain is obscured) MUST be isolated with `is_confidential: true` metadata and MUST NOT be merged with public domain records.

---

## 3. Existing Repository Contract (`src/collection/collector-contract.mjs`)
```javascript
export function collectorIdentity({ sourceId, collectorId, version })
export function normalizeRawDocument({
  sourceId,
  sourceType,
  canonicalUrl,
  title,
  rawText,
  contentReference,
  author,
  publishedAt,
  discoveredAt,
  retrievedAt,
  countryHint,
  language,
  metadata
})
export function retrievalFailure({ kind, retryAfterMs, message })
```

---

## 4. Implementation Requirements
Create:
1. `src/collection/trustmrr-collector.mjs` (or `src/collectors/trustmrr.mjs`):
   - `createTrustMrrCollector({ apiKey, baseUrl, fetchFn })`: Factory returning collector instance.
   - `collectorIdentity`: `{ sourceId: "trustmrr", collectorId: "trustmrr-http-collector", version: "1.0.0" }`.
   - `buildStartupCanonicalUrl(slug)`: Returns `https://trustmrr.com/startup/${slug}`.
   - `normalizeTrustMrrStartup(rawStartup, { retrievedAt, discoveredAt })`: Produces normalized `RawDocument` adhering to `normalizeRawDocument`.
   - `parseTrustMrrResponse(jsonPayload, { retrievedAt, discoveredAt })`: Parses listing array into normalized documents and bounded next cursor/page token.
   - `handleHttpError(status, headers, body)`: Classifies HTTP errors into `retrievalFailure` (`RATE_LIMITED` with `retryAfterMs`, `RETRYABLE` for 5xx, `FINAL` for 4xx).
   - Invariant enforcement: Tags all financial data into `metadata.financials` with `claim_type: "SOURCE_CLAIM"`. Tags confidential listings with `metadata.confidential = true`.

2. `test/trustmrr-collector.test.mjs`:
   - Unit tests covering:
     - Identity determinism
     - Canonical URL generation (HTTPS)
     - Full document normalization into `RawDocument`
     - Confidential listing isolation
     - Rate limit (429) & error classification (`retrievalFailure`)
     - Bounded pagination token handling

3. `docs/ai/TASK_CONTRACTS/PKG-COL-002.md`:
   - Contract documentation for PKG-COL-002.

---

## 5. Output Format
Provide complete, drop-in ESM JavaScript code for:
- `src/collection/trustmrr-collector.mjs`
- `test/trustmrr-collector.test.mjs`
- `docs/ai/TASK_CONTRACTS/PKG-COL-002.md`
