# PKG-COL-002: Implementation from GLM-5.3

PACKAGE=PKG-COL-002
ROLE=Backend & Infrastructure Lead (Lead Implementer)
TARGET_SOURCE=TrustMRR (https://trustmrr.com)
TASK=TRUSTMRR_CONTROLLED_COLLECTOR_IMPLEMENTATION

Artifact under review:
https://raw.githubusercontent.com/mytest19861986/idea-1/1688d3b2ff82c21966db28dfb54784a9238914ec/temp/agents/PKG-COL-002/glm-task.md

Task Details:
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


REQUIREMENTS:
Write complete, production-grade ESM JavaScript code (no pseudo-code, no placeholders) for:
1. `src/collection/trustmrr-collector.mjs`
2. `test/trustmrr-collector.test.mjs`
3. `docs/ai/TASK_CONTRACTS/PKG-COL-002.md`

OUTPUT FORMAT:
Return each file in clear markdown code blocks with the exact file path. 
 
Show full message
Thought Process
src/collection/trustmrr-collector.mjs
javascript
/**
 * TrustMRR Controlled Collector Adapter
 * Package: PKG-COL-002
 *
 * Architectural boundaries:
 *  - NO production activation (source remains un-activated)
 *  - NO database mutation or side effects
 *  - NO scheduler / timers / cron / background workers
 *  - NO bulk crawling (bounded, single-page collection mechanics only)
 *  - Controlled testing only (transport is injectable and fully mockable)
 *
 * Invariants enforced:
 *  - TRUSTMRR-G001: financial metrics are tagged as SOURCE_CLAIM with provenance
 *  - TRUSTMRR-G002: bounded pagination, rate-limit handling with retryAfterMs,
 *                   failure classification (RETRYABLE / RATE_LIMITED / FINAL)
 *  - TRUSTMRR-G003: confidential/stealth listings are isolated and never merged
 *                   with public domain records
 */


import { normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";


export const SOURCE_ID = "trustmrr";
export const COLLECTOR_ID = "trustmrr-http-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://trustmrr.com/api/v1";
export const CANONICAL_SITE_ORIGIN = "https://trustmrr.com";


/**
 * TrustMRR exposes page-based pagination via `page` and `meta.hasMore`,
 * with a hard API-side page size ceiling of 10 records per page.
 * See: https://trustmrr.com/docs/api/list-startups
 */
export const API_MAX_PAGE_LIMIT = 10;


/**
 * Task contract mandates a 20 req/min backoff baseline.
test/trustmrr-collector.test.mjs
javascript
  assert.equal(rateLimited.failure.retryAfterMs, 7000);


  const serverError = await createTrustMrrCollector({
    apiKey: "tmrr_test_key",
    fetchFn: async () => createResponse({ status: 503, body: "unavailable" }),
  }).fetchPage({ page: 1 });
  assert.equal(serverError.ok, false);
  assert.equal(serverError.failure.kind, "RETRYABLE");


  const unauthorized = await createTrustMrrCollector({
    apiKey: "tmrr_test_key",
    fetchFn: async () => createResponse({ status: 401, body: "invalid key" }),
  }).fetchPage({ page: 1 });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.failure.kind, "FINAL");
  assert.equal(unauthorized.failure.retryAfterMs, null);


  const transportError = await createTrustMrrCollector({
    apiKey: "tmrr_test_key",
    fetchFn: async () => { throw new Error("network down"); },
  }).fetchPage({ page: 1 });
  assert.equal(transportError.ok, false);
  assert.equal(transportError.failure.kind, "RETRYABLE");
  assert.ok(transportError.failure.message.includes("network down"));


  const badJson = await createTrustMrrCollector({
    apiKey: "tmrr_test_key",
    fetchFn: async () => createResponse({ status: 200, body: new Error("invalid json") }),
  }).fetchPage({ page: 1 });
  assert.equal(badJson.ok, false);
  assert.equal(badJson.failure.kind, "FINAL");
  assert.ok(badJson.failure.message.includes("non-JSON"));
});


test("fetchStartup normalizes a single detail payload", async () => {
  const calls = [];
  const collector = createTrustMrrCollector({
    apiKey: "tmrr_test_key",
    fetchFn: async (url) => {
      calls.push(url);
      return createResponse({ body: { data: PUBLIC_STARTUP } });
    },
  });


  const result = await collector.fetchStartup("shipfast", {
    retrievedAt: RETRIEVED_AT,
    discoveredAt: DISCOVERED_AT,
  });


  assert.equal(result.ok, true);
  assert.equal(calls[0], "https://trustmrr.com/api/v1/startups/shipfast");
  assert.equal(result.document.canonicalUrl, "https://trustmrr.com/startup/shipfast");
  assert.equal(result.document.metadata.financials.mrrCents.claim_type, "SOURCE_CLAIM");
});


test("pagination limit is clamped to the API maximum of 10", () => {
  const url = buildListStartupsUrl({ page: 1, limit: 500 });
  assert.equal(url, "https://trustmrr.com/api/v1/startups?page=1&limit=10");


  const lowUrl = buildListStartupsUrl({ page: 1, limit: 0 });
  assert.equal(lowUrl, "https://trustmrr.com/api/v1/startups?page=1&limit=10");
});
docs/ai/TASK_CONTRACTS/PKG-COL-002.md
PKG-COL-002 — TrustMRR Controlled Collector Contract

Package: PKG-COL-002
Title: TrustMRR Controlled Collector Design & Invariant Contract
Role: Backend & Infrastructure Lead
Target Source: TrustMRR (https://trustmrr.com)
Status: Implemented — controlled testing only, source remains un-activated

1. Scope and Architectural Boundaries

This package defines a controlled collector adapter for TrustMRR and its invariant contract. It exists to make the TrustMRR source integration ready for review without violating any of the repository’s activation boundaries.

Boundary	Enforcement
No production activation	The collector is a library module. Nothing in this package registers the source, flips an activation flag, or enables it in any registry.
No database mutation	The module performs zero writes. It produces immutable RawDocument values and retrievalFailure values for the caller to handle.
No scheduler	No timers, cron jobs, background workers, or long-lived loops are created. All fetch functions are single-shot, caller-invoked operations.
No bulk crawling	Only single-page list requests and single-startup detail requests are supported. Pagination is represented as a bounded nextCursor, never auto-followed.
Controlled testing only	The transport (fetchFn) is injectable. The test suite uses only mock transports and performs no live network access.
2. Mandatory Invariants
TRUSTMRR-G001 — Claim Boundary

All revenue, MRR, ARR, customer, subscription, growth, margin, multiple, and pricing values originating from TrustMRR are normalized into metadata.financials with:

claim_type: "SOURCE_CLAIM" on every financial field
provenance.provider_backed: boolean indicating whether the metric is backed by a connected payment provider
provenance.verified_by: <payment provider slug | null>
provenance.source_system: "trustmrr"
provenance.source_slug, provenance.source_endpoint, provenance.source_entity_type
provenance.claim_policy: "SOURCE_CLAIM"
provenance.unit_policy describing USD cents and percentage conventions

These values must never be upgraded to platform-verified FACT. Downstream consumers must treat all TrustMRR financials as source claims subject to the upstream verification model, not as independently verified ground truth.

TRUSTMRR-G002 — Access Boundary
Pagination is page-based and bounded; limit is clamped to the TrustMRR API maximum of 10.
The collector returns a nextCursor (string page number) only when meta.hasMore is true; it never auto-follows cursors.
Rate-limit handling defaults to the task-mandated 20 req/min baseline (DEFAULT_RATE_LIMIT_PER_MINUTE = 20, yielding a 3000 ms backoff). Runtime callers must additionally respect the API’s X-RateLimit-* response headers when present.
HTTP failures are classified deterministically:
Status	Classification	retryAfterMs
429	RATE_LIMITED	Derived from Retry-After (seconds or HTTP-date), else X-RateLimit-Reset, else the 20 req/min baseline
5xx	RETRYABLE	Baseline backoff (3000 ms)
Other 4xx	FINAL	null
Transport/JSON errors	RETRYABLE (network) or FINAL (malformed 200 body)	As appropriate

All failures are returned as retrievalFailure({ kind, retryAfterMs, message }) per the repository collector contract.

TRUSTMRR-G003 — Entity Boundary

Confidential or stealth marketplace listings are detected when any of the following is true:

stealthMode === true
website is null/empty and name matches an anonymity pattern (Anonymous, Confidential, Hidden, Stealth, case-insensitive)

For confidential listings, the adapter:

Sets metadata.confidential = true and metadata.is_confidential = true
Records metadata.confidentialReasons (e.g. ["stealth_mode"] or ["website_masked", "anonymous_name"])
Sets metadata.website = null so no domain is carried forward
Sets metadata.mergePolicy = "DO_NOT_MERGE_WITH_PUBLIC_DOMAIN_RECORDS"
Masks the document title to Confidential TrustMRR listing (<slug>)

Confidential documents must never be merged with public domain records in downstream entity resolution.

3. Exported API Surface
Constants
SOURCE_ID — "trustmrr"
COLLECTOR_ID — "trustmrr-http-collector"
COLLECTOR_VERSION — "1.0.0"
DEFAULT_BASE_URL — "https://trustmrr.com/api/v1"
CANONICAL_SITE_ORIGIN — "https://trustmrr.com"
API_MAX_PAGE_LIMIT — 10
DEFAULT_RATE_LIMIT_PER_MINUTE — 20
DEFAULT_BACKOFF_MS — 3000
ERROR_KIND — frozen { RETRYABLE, RATE_LIMITED, FINAL }
collectorIdentity — frozen identity object
getCollectorIdentity() — identity accessor for backwards compatibility
URL builders
buildStartupCanonicalUrl(slug) → https://trustmrr.com/startup/<encoded-slug>
buildStartupApiUrl(slug, baseUrl?) → <baseUrl>/startups/<encoded-slug>
buildListStartupsUrl({ baseUrl, page, limit }) → <baseUrl>/startups?page=<n>&limit=<n>
Normalization and parsing
normalizeTrustMrrStartup(rawStartup, { retrievedAt, discoveredAt }) → RawDocument
parseTrustMrrResponse(jsonPayload, { retrievedAt, discoveredAt, currentPage }) → frozen { documents, nextCursor, hasMore, pagination }
Error handling
handleHttpError(status, headers, body) → retrievalFailure({ kind, retryAfterMs, message })
Factory
createTrustMrrCollector({ apiKey, baseUrl, fetchFn, defaultLimit }) → frozen collector instance exposing:
identity, baseUrl, defaultLimit
buildStartupCanonicalUrl, buildStartupApiUrl, buildListStartupsUrl
handleHttpError
fetchPage({ page, limit, retrievedAt, discoveredAt }) → { ok, url, result } | { ok: false, url, failure }
fetchStartup(slug, { retrievedAt, discoveredAt }) → { ok, url, document } | { ok: false, url, failure }
4. RawDocument Mapping
RawDocument field	TrustMRR mapping
sourceId	"trustmrr"
sourceType	"marketplace_startup_listing"
canonicalUrl	https://trustmrr.com/startup/<slug>
title	Startup name, or Confidential TrustMRR listing (<slug>) for confidential listings
rawText	JSON serialization of the raw startup object
contentReference	https://trustmrr.com/api/v1/startups/<slug>
author	xHandle, or first cofounder xHandle, else null
publishedAt	firstListedForSaleAt, else foundedDate, else null
discoveredAt	Caller-provided, defaults to epoch
retrievedAt	Caller-provided, defaults to epoch
countryHint	country
language	null
metadata	See below
metadata structure
sourceSlug, sourceEntityType, sourceEndpoint
identity: { sourceId, collectorId, version }
paymentProvider, category, targetAudience, country, foundedDate
onSale, firstListedForSaleAt, website, domainRating, rank, stealthMode
financials — object of field-level claims, each with { value, unit, claim_type, provenance }
financialsClaimType: "SOURCE_CLAIM"
provenance — source-level provenance block
confidential, is_confidential
confidentialReasons, mergePolicy (confidential listings only)
financials fields
Key	Source field	Unit
revenueLast30DaysCents	revenue.last30Days	usd_cents
mrrCents	revenue.mrr	usd_cents
totalRevenueCents	revenue.total	usd_cents
askingPriceCents	askingPrice	usd_cents
customers	customers	count
activeSubscriptions	activeSubscriptions	count
growth30dPercent	growth30d	percent
growthMrr30dPercent	growthMRR30d	percent
profitMarginLast30DaysPercent	profitMarginLast30Days	percent
revenueMultiple	multiple	ratio
5. Pagination and Rate Limit Semantics

TrustMRR’s list endpoint uses page-based pagination with page, limit (max 10), and meta.hasMore. The adapter exposes this as:

parseTrustMrrResponse(payload, { currentPage }) => {  documents: RawDocument[],  nextCursor: string | null,   // next page number as string, null when hasMore is false  hasMore: boolean,  pagination: { total, page, limit, hasMore, nextPage }}

The collector never follows nextCursor automatically. Callers remain responsible for bounding traversal.

Rate-limit resolution order for 429:

Retry-After header (seconds or HTTP-date)
X-RateLimit-Reset header (Unix timestamp, seconds or milliseconds)
DEFAULT_BACKOFF_MS derived from DEFAULT_RATE_LIMIT_PER_MINUTE = 20

The static default reflects the task contract. TrustMRR’s public documentation currently describes 10 req/min (standard) and 60 req/min (premium) tiers; runtime callers must prefer the API’s X-RateLimit-* headers over the static default whenever they are present.

6. Testing Strategy

Tests live in test/trustmrr-collector.test.mjs and use Node’s built-in test runner:

bash
node --test test/trustmrr-collector.test.mjs

No live network access is required. All HTTP interactions are simulated via an injected fetchFn.

Covered behaviors
Identity determinism and contract compliance
Canonical URL generation (HTTPS, slug encoding)
Full document normalization into RawDocument
Financial claim tagging (SOURCE_CLAIM, provider_backed, verified_by)
Confidential listing isolation (stealthMode, masked website + anonymous name)
Absence of any FACT upgrades in serialized financials
Bounded pagination token handling (nextCursor, hasMore, pagination)
Error classification: RATE_LIMITED, RETRYABLE, FINAL
Factory validation and URL builder correctness
Single-page fetch mechanics via mock transport
Page-limit clamping to the API maximum of 10
Mock transport shape

The test suite injects a minimal fetchFn returning:

javascript
{
  ok: boolean,
  status: number,
  headers: object,
  json: async () => any,
  text: async () => string
}

This shape is sufficient for the adapter’s error path, header inspection, and JSON parsing, and avoids coupling tests to any specific HTTP client library.

7. Compliance and Activation Notes
This package does not activate the TrustMRR source.
This package does not write to any datastore.
This package does not schedule any collection.
Public display, bulk export, republication, search-engine indexing, or incorporation of TrustMRR API data into a customer-facing product requires TrustMRR’s prior written permission under its API Acceptable Use Policy. Activation decisions must be coordinated with legal and platform governance before any production use beyond internal analysis.
text


Notes on the implementation decisions, grounded in current TrustMRR documentation:


- Pagination is capped at 10 records per page, and traversal continues while `meta.hasMore` is true, per the list-startups endpoint spec【turn2fetch0】【turn3fetch1】.
- Monetary fields are documented as USD cents, which is why the financials carry explicit `usd_cents` units rather than assuming dollars【turn3fetch0】.
- The task’s 20 req/min baseline is implemented as the static default, while runtime code prefers `Retry-After` and `X-RateLimit-Reset` headers; TrustMRR’s own docs describe 10/60 req/min tiers, so the header-driven path is the authoritative one【turn1search0】【turn2fetch1】.
- Confidentiality detection combines `stealthMode` with the observed pattern of masked websites paired with "Anonymous startup" names, which appears in live marketplace data【turn5fetch0】.
Deep Think
Max