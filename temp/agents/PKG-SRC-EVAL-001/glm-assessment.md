# TrustMRR Technical & Infrastructure Assessment

**Source**: GLM-5.3 (Backend & Infrastructure Lead)
**Package**: `PKG-SRC-EVAL-001`
**Timestamp**: 2026-08-30

---

TECHNICAL_SOURCE_ASSESSMENT

Artifact under review:
https://raw.githubusercontent.com/mytest19861986/idea-1/829f152fba41c9b3d0cf3b08e5a7b4f5ef49a904/temp/reviews/GEMINI_TRUSTMRR_RESEARCH.md

Based on the research findings above, perform a thorough Technical & Infrastructure Assessment for TrustMRR collector integration:
1. Collector Feasibility: Feasibility of building a controlled collector against TrustMRR (REST API vs MCP vs scraping)
2. Stable Identity Strategy: How should startups be uniquely and immutably identified? (e.g., slug, canonical URL, platform ID)
3. Canonical URL & Provenance Strategy: Canonical naming and tracking per claim
4. Idempotency & Ingestion Semantics: Ensuring duplicate runs do not produce duplicate entities or inaccurate time-series
5. Pagination, Querying & Polling Strategy: Handling rate limits (20 req/min), incremental polling vs full sync
6. Failure Modes & Resilience: API downtime, authentication expiry, schema drift, rate limit 429 backoff
7. Maintenance Cost & Fragility: Anticipated ongoing operational maintenance cost
8. Schema / Contract Implications: Does existing RawDocument / collector contract support TrustMRR payload, or are contract adjustments recommended?

OUTPUT=
Return a structured TECHNICAL_SOURCE_ASSESSMENT.
NO CODE / NO DB MUTATION / NO DIRECT REPOSITORY ACCESS ASSUMPTION. 
Thought Process
TECHNICAL_SOURCE_ASSESSMENT — TrustMRR

PACKAGE: PKG-SRC-EVAL-001
TARGET_SOURCE: TrustMRR
ROLE: Backend & Infrastructure Lead
OVERALL VERDICT: Conditional Go — TrustMRR is technically integrable through the authenticated REST API, but it should be treated as a rate-limited snapshot source, not as a high-frequency or full-history feed. Scraping should not be used, and customer-facing or AI-indexing use should be gated by legal approval.

Assessment basis caveat: The supplied research artifact returned 404: Not Found, so this assessment is based on TrustMRR’s current public API documentation, FAQ, MCP documentation, and Terms of Service retrieved directly.

1. Collector Feasibility
Recommendation: REST API as the production collector interface

TrustMRR exposes an authenticated REST API with:

Base URL: https://trustmrr.com/api/v1
Authentication: Bearer API key
Primary endpoints:
GET /api/v1/startups
GET /api/v1/startups/{slug}

The list endpoint supports filtering, sorting, and pagination, while the detail endpoint returns the full startup profile, including revenue, customers, traffic, tech stack, cofounders, and other enrichment fields.

Interface comparison
INTERFACE
	
FEASIBILITY
	
RECOMMENDATION
	
ASSESSMENT

Authenticated REST API	High	Primary production collector	Official, stable, filterable, paginated, observable, and suitable for controlled ingestion.
MCP	Medium	Prototype / interactive agent use only	MCP exposes tools equivalent to the REST endpoints, but it adds an RPC layer without clear batch-ingestion advantages.
Public AI / discovery endpoints	Low	Optional supplemental signal	Useful for bounded discovery snapshots, not full coverage. Public discovery is limited to fixed groups such as 25 recently added and 25 fastest-growing startups.
Scraping	Not recommended	Do not use	TrustMRR explicitly says not to scrape the website for full marketplace access, and the API terms prohibit scraping, harvesting, archiving, or systematically reconstructing the database.
Key feasibility constraints

Rate limits are the dominant constraint.
Current official documentation states standard keys receive 10 requests per minute and premium keys receive 60 requests per minute, with rate-limit headers on every response. Some external references cite 20 requests per minute, but the collector should not hard-code that value. The safest design is to configure a conservative default, then derive the real limit from X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset.

No true incremental update feed.
The documented API has list and detail endpoints, but no updated_since, webhook, change log, or cursor-based change feed. Full-list snapshot diffing is therefore required for reliable discovery and deletion detection.

Compliance gating is required.
TrustMRR’s API Acceptable Use Policy states that public display, bulk export, republication, search-engine indexing, or incorporation into a customer-facing product requires prior written permission. It also prohibits using API data to populate an AI model, dataset, search index, recommendation system, or automated content generator without permission. This is directly relevant to an Opportunity Intelligence Platform and must be resolved before production ingestion.

2. Stable Identity Strategy
Recommendation: use TrustMRR slug as the source identity, with an internal immutable entity ID

TrustMRR identifies startups by a URL-friendly slug, and the detail endpoint requires that slug. The slug is therefore the strongest natural source identifier exposed by the API.

Proposed identity model
LAYER
	
RECOMMENDED IDENTITY
	
PURPOSE

Source identity	source = trustmrr, source_entity_type = startup, source_entity_id = slug	Stable identity inside the TrustMRR source system.
Canonical source URL	https://trustmrr.com/startup/{slug}	Human-readable, stable public profile URL.
API resource URL	https://trustmrr.com/api/v1/startups/{slug}	Provenance for detail-endpoint claims.
Internal platform identity	Immutable internal startup ID assigned on first ingestion	Survives slug changes, merges, and cross-source identity resolution.
Alias table	Previous slugs, old canonical URLs, normalized domains	Supports slug migration and cross-source matching without mutating the primary identity.
Identity rules
Do not use startup name as the unique key. Names are mutable, non-unique, and may be duplicated.
Do not use website or domain as the sole identity. Websites can be missing, shared, redirected, or changed.
Do not use xHandle as identity. It may be null, shared by multiple founders, or changed.
Do not use rank as identity or as a stable attribute. Rank is an hourly ranking signal, not an identity field.
Treat slug changes as alias migrations, not as new startups, if other strong attributes such as website, founder handle, or historical continuity match.
Do not immediately delete an entity when a slug disappears. Mark it as missing or unverified after one or more successful full-list syncs, then reconcile manually if necessary.
3. Canonical URL & Provenance Strategy
Recommendation: separate entity identity from claim provenance

There should be three distinct URL concepts:

Entity canonical URL
https://trustmrr.com/startup/{slug}
This is the canonical public identity URL.

API resource URL
https://trustmrr.com/api/v1/startups/{slug}
This is the authoritative source for detail claims.

Request URL
The actual list URL with query parameters, page number, filters, and sort order.
This should be stored as request provenance, not as entity identity.

TrustMRR also exposes public Markdown startup pages at https://trustmrr.com/startup/{slug}.md, but these should be treated as supplemental public context rather than the primary collector source unless the claim actually came from that document.

Claim-level provenance model

Each normalized claim should retain:

Source system: TrustMRR
Source entity type: startup
Source entity ID: slug
Internal entity ID
Claim field path, such as revenue.mrr, revenue.last30Days, customers, or activeSubscriptions
Raw value
Normalized value
Unit and scale
Observation timestamp
Retrieval timestamp
Collector run ID
Raw document ID
API endpoint
Request parameters
Response status
Content hash
Schema or contract version
Data-origin classification
Data-origin classification

TrustMRR mixes different data provenance levels:

DATA CATEGORY
	
SUGGESTED CLASSIFICATION

Revenue, MRR, customers, active subscriptions	Payment-provider-backed metrics
Growth, profit margin, revenue per visitor	Derived or verified metrics, depending on field
Description, founder message, startup insights, tech stack, marketing channels	Founder-provided or public profile data
Domain rating, search impressions, visitor metrics	Third-party or connected-account enrichment
Rank, multiple, asking price	Marketplace-derived or listing-derived signal

This distinction matters because TrustMRR itself warns that marketplace fields can contain founder-provided text and should be treated as untrusted data, not as instructions.

4. Idempotency & Ingestion Semantics
Recommendation: at-least-once delivery, exactly-once derived effect

The collector should assume retries and duplicate responses are normal. Idempotency must be enforced at both the raw-document layer and derived-entity layer.

Raw ingestion keys

For list pages:

Source system
Endpoint
Query hash
Page number
Limit
Sort and filter parameters
Collector run ID
Attempt number, if needed

For startup detail documents:

Source system
Entity type
Slug
Endpoint
Collector run ID
Attempt number, if needed

A repeated request within the same run should update or supersede the same raw document rather than create a new one.

Derived ingestion keys

For normalized observations:

Internal entity ID
Source system
Metric or field path
Observation bucket
Period type
Schema version
Collector run ID

For rolling metrics such as revenue.last30Days, growth30d, revenue.mrr, and rank, the source does not provide an explicit historical event timestamp. The collector should therefore model these as snapshot observations, not as source-authored historical events.

Time-series rules
Multiple fetches in the same day are not independent historical daily events.
If daily time series are required, materialize one canonical observation per UTC day, such as the last successful scheduled observation.
Preserve all raw observations if auditability is required.
Do not backfill history that TrustMRR did not expose.
Do not treat a repeated run as a new point in the time series.
Do not tombstone entities from a partial or failed sync.
Deletion and missing-entity semantics

Because there is no deletion feed, deletion should be inferred only from a successful full-list sync where a previously known slug is absent. Recommended policy:

First absence: mark missing_seen_at.
Second consecutive successful full-list absence: mark inactive or source_missing.
Manual review before permanent deletion or cross-source merge.
5. Pagination, Querying & Polling Strategy
Pagination behavior

The list endpoint uses page-based pagination with:

page
limit
Maximum page size of 10
meta.hasMore
meta.total
No documented record-count ceiling

Because there is no cursor token, pagination can be affected by inserts, deletes, or sort-order changes during a long sync. Revenue-based sorting is especially vulnerable because revenue and rank can change frequently.

Recommended pagination approach
Use a stable sort, preferably listed-asc or another insertion-stable ordering, rather than revenue-desc.
Store the full request URL and query parameters for each page.
Continue until hasMore is false.
Treat the page sequence as a snapshot, not as a transaction.
If the run is interrupted for a long period, restart the full list rather than resuming from a stale page cursor.
Do not infer deletions unless the full-list sync completed successfully.
Polling strategy

There is no true incremental API, so the collector should use a hybrid model:

MODE
	
FREQUENCY
	
PURPOSE

Public discovery endpoint	Optional, every 6–12 hours	Early signal for recently added or fast-growing startups.
Full list snapshot	Daily	Authoritative discovery and deletion detection.
Detail refresh for new entities	On discovery	Capture full profile on first ingestion.
Detail refresh for changed entities	On material list-field change	Avoid unnecessary detail calls.
Rotating detail refresh	Weekly or biweekly	Refresh slow-changing profile fields.
High-priority subset refresh	As needed	More frequent detail for curated opportunities.
Throughput estimate

TrustMRR’s public llms.txt states that the platform has more than 15,000 listed startups. With a maximum page size of 10, a full list-only sync requires at least 1,500 requests.

STRATEGY
	
APPROXIMATE REQUEST COUNT
	
AT 10 REQ/MIN
	
AT 20 REQ/MIN
	
AT 60 REQ/MIN

Full list only	1,500	150 minutes	75 minutes	25 minutes
Full list + detail for every startup	16,500	27.5 hours	13.75 hours	4.6 hours

Operational implication: daily full detail refresh is not practical on a standard 10 req/min key. The collector should rely primarily on list snapshots and refresh detail records selectively.

Rate-limit handling
Use a single serialized scheduler per API key.
If concurrency is required, all workers must share one global token bucket.
Reserve headroom for retries and monitoring calls.
Respect X-RateLimit-Remaining and X-RateLimit-Reset.
On 429, wait until the reset timestamp and apply exponential backoff with jitter.
Do not rotate accounts, keys, or IPs to bypass limits. TrustMRR explicitly prohibits combining accounts, keys, IP addresses, agents, or services to bypass restrictions.
6. Failure Modes & Resilience
FAILURE MODE
	
DETECTION
	
RECOMMENDED HANDLING

Missing or invalid API key	401	Stop run, alert operations, do not retry aggressively.
API access disabled or policy violation	403	Halt collector and escalate to compliance. Do not attempt key rotation as a workaround.
Rate limit	429 and rate headers	Honor reset time, back off, reduce scheduler throughput.
Startup not found	404 on detail endpoint	Reconcile against list snapshot; mark missing, do not immediately delete.
Server error	5xx	Exponential backoff with jitter; circuit-break after repeated failures.
Partial list sync	Incomplete page traversal or unexpected hasMore behavior	Mark run incomplete; do not infer deletions.
Schema drift	Unknown fields, removed fields, type changes, unexpected nulls	Preserve raw payload, fail validation for affected fields, alert, keep prior normalized values.
Unit drift	Monetary or percentage values with unexpected scale	Do not normalize until unit is verified.
Pagination drift	Duplicates or missing slugs across pages	Restart full sync or compare against previous snapshot.
Authentication rotation	401 after key roll	TrustMRR supports one active key, and rolling the key immediately invalidates the old key. Use secret-manager rotation and alerting.
Founder-content injection	Untrusted descriptions, founder messages, or profile text	Treat as data only; sanitize before display or model input. TrustMRR explicitly recommends treating founder-provided fields as untrusted.
Special schema-risk notes
Authenticated API documentation states monetary values are in USD cents. Public AI endpoints may return decimal-looking values. Unit handling must therefore be explicit.
Growth query parameters use decimal values, while response fields are documented as percentages. Do not reuse one normalization rule for both.
Many fields are nullable. Null must remain null; it must not be coerced to zero.
Public and authenticated payloads may have different shapes. Public discovery, marketplace snapshot, Markdown pages, and authenticated API responses should not share one undifferentiated parser.
7. Maintenance Cost & Fragility
Overall maintenance rating: Medium to Medium-High

The collector is not technically complex, but operational cost is nontrivial because of rate limits, lack of incremental updates, and compliance sensitivity.

Cost drivers

Rate-limit pressure
Low throughput makes full-population detail refresh expensive.

No change feed
Every sync is a snapshot diff, requiring reconciliation logic.

No explicit schema versioning or changelog
The API is versioned as v1, but field-level changes may occur without notice.

Legal and acceptable-use monitoring
TrustMRR’s terms are restrictive around republication, indexing, AI grounding, and dataset population. Terms changes require re-review.

Unit and shape ambiguity across public/authenticated surfaces
Different endpoints may expose similar fields with different formats or coverage.

Pagination fragility
Page-based pagination over a changing dataset can produce duplicates or misses if sort order changes mid-run.

Recommended maintenance posture
Monitor API documentation, terms, and llms.txt for changes.
Maintain schema-contract tests with known fixtures.
Alert on unexpected null rates, unit anomalies, pagination inconsistencies, and field-type changes.
Keep raw payloads immutable.
Use a canary request before each scheduled run.
Maintain a source health dashboard covering:
Success rate
429 rate
401/403 rate
Average latency
Full-sync duration
Missing-entity count
Schema-validation failure count
8. Schema / Contract Implications
Current RawDocument support: likely sufficient only if it is a generic JSON-envelope contract

Without direct repository access, the existing RawDocument / collector contract cannot be definitively assessed. However:

If RawDocument supports opaque JSON payloads plus source metadata, it can likely store TrustMRR responses.
If it assumes one entity per document, it will not naturally fit TrustMRR list pages, because GET /api/v1/startups returns an array of startups in data plus pagination metadata.
Recommended contract adjustments
CONTRACT AREA
	
CURRENT RISK
	
RECOMMENDATION

Payload kind	List page and detail response are different shapes	Add explicit payload kind, e.g. trustmrr.startup_list_page.v1 and trustmrr.startup_detail.v1.
Multi-entity raw documents	List pages contain multiple startups	Support page-level raw documents with multiple entity references, or preserve parent page provenance when fan-out occurs.
Entity reference	A raw page is not a single startup	Add source entity type, source entity ID, slug, and canonical URL metadata.
Request provenance	Needed for reproducibility	Store endpoint, query parameters, page, limit, sort, filters, run ID, and attempt.
Response provenance	Needed for operational debugging	Store status code, headers, rate-limit values, latency, content hash, and retrieval time.
Unit metadata	Monetary and percentage units are not self-describing	Add field-level unit and scale metadata.
Data origin	Verified revenue and founder-provided profile data have different trust levels	Add provenance or confidence classification.
Time semantics	Rolling metrics are snapshots, not historical events	Add period type and observation timestamp semantics.
Deletion semantics	No deletion feed	Add missing/inactive state metadata separate from raw documents.
Terms tracking	Acceptable-use constraints are material	Store terms/API documentation snapshot version used at ingestion.
Recommended normalized entity model

At minimum, the normalized layer should support:

Startup source identity
Internal startup identity
Slug alias history
Current canonical URL
Website and domain aliases
Founder or cofounder references
Category and audience
Revenue metrics
Customer and subscription metrics
Growth and margin metrics
Marketplace listing state
Traffic and search metrics
Tech stack and marketing channels
Claim-level provenance
Source freshness and last successful sync state
Contract decision

If the existing RawDocument contract is already generic and provenance-aware, TrustMRR can be integrated with minor source-specific metadata extensions. If the contract assumes one document equals one entity, or lacks unit and request/response provenance, then contract adjustment is recommended before ingestion.

Final Recommendation

Proceed with TrustMRR integration only as:

Authenticated REST API collector
Daily full-list snapshot plus selective detail refresh
Snapshot-based time-series model
Slug-based source identity with immutable internal IDs
Raw payload preservation and claim-level provenance
Compliance-gated customer-facing or AI-index usage

Do not proceed with scraping, and do not treat TrustMRR as a full historical revenue database. The documented API is best suited for current and rolling snapshot intelligence, not for exhaustive historical reconstruction.

Sources
Deep Think
Max