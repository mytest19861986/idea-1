# LOCAL-LIVE-DISCOVERY-001: Phase B Comprehensive Source Governance Dossier

**Target**: Complementary, Low-Legal-Risk, High-Evidence Public Opportunity Sources  
**Governance Policy**: Strictly `CANDIDATE` (Zero active connectors, zero background execution)

---

## 1. Executive Summary & Selection Philosophy
Rather than maximizing raw volume with duplicate launch noise, the strategy prioritizes **evidence complementarity** across 7 distinct dimensions:
1. `PRODUCT_LAUNCH` (New product claims & launches)
2. `DEVELOPER_TRACTION` (Code velocity, star growth, package adoption)
3. `COMMUNITY_DEMAND` (Real user complaints, feature requests, unmet needs)
4. `STARTUP_VALIDATION` (Incubator cohort entry, venture backing)
5. `PUBLIC_TRACTION` (Milestone updates, self-reported metrics)
6. `MARKET_GAP` (Unserved niches, RFP / bounty requests)
7. `COMPANY_VALIDATION` (Corporate changelogs, public hiring/expansion signals)

---

## 2. Comprehensive 11-Source Governance Matrix

### Source 1: Product Hunt Official API v2
- **OFFICIAL_URL_OR_API**: `https://api.producthunt.com/v2/api/graphql`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Official GraphQL API via Developer Application
- **AUTH_REQUIRED**: `YES` (OAuth2 Developer Bearer Token)
- **RATE_LIMIT**: 500 requests / day (strictly bounded, safe for periodic sync)
- **TERMS_ACCESS_CONSTRAINTS**: Requires developer registration; commercial use permitted under standard Developer Terms.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: N/A (Official GraphQL API used, no HTML scraping).
- **EXPECTED_SIGNAL**: `PRODUCT_LAUNCH` (Daily curated product launches, upvotes, maker comments).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: High (Early maker product claims, launch velocity).
- **SELF_REPORTED_DATA_RISK**: Medium (Maker claims may be optimistic).
- **DUPLICATION_RISK**: Medium (May overlap with Hacker News Show submissions).
- **PRIVACY_RISK**: Low (Public product names, maker handles, zero PII collected).
- **LEGAL_TOS_RISK**: Low (Official API with explicit developer registration).
- **IMPLEMENTATION_COMPLEXITY**: Low/Medium (GraphQL query client).
- **RECOMMENDED_INITIAL_PRIORITY**: `HIGH` (Top tier complement for launch signals).
- **PROPOSED_STATE**: `CANDIDATE`

### Source 2: GitHub Search & Trending API
- **OFFICIAL_URL_OR_API**: `https://api.github.com/search/repositories`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Official REST API / JSON
- **AUTH_REQUIRED**: `YES` (Personal Access Token for 5000 req/hr; 60 req/hr unauthenticated)
- **RATE_LIMIT**: 5,000 requests / hour with token.
- **TERMS_ACCESS_CONSTRAINTS**: Standard GitHub REST API terms of service.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Official API endpoint.
- **EXPECTED_SIGNAL**: `DEVELOPER_TRACTION` (Repository creation, star growth velocity, topic tags).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM` & `FACT` (Commit history and star timestamps are cryptographic platform facts).
- **EVIDENCE_VALUE**: Very High (Objective, tamper-resistant developer adoption metrics).
- **SELF_REPORTED_DATA_RISK**: Very Low (Platform-verified commit and star telemetry).
- **DUPLICATION_RISK**: Low (Focuses on OSS codebases rather than marketing landing pages).
- **PRIVACY_RISK**: Low (Public repository metadata and descriptions).
- **LEGAL_TOS_RISK**: Very Low (Official REST API with well-defined quota).
- **IMPLEMENTATION_COMPLEXITY**: Low (Standard REST fetcher).
- **RECOMMENDED_INITIAL_PRIORITY**: `HIGH` (Top tier complement for objective technical traction).
- **PROPOSED_STATE**: `CANDIDATE`

### Source 3: Reddit (r/SideProject, r/SaaS, r/Entrepreneur)
- **OFFICIAL_URL_OR_API**: `https://oauth.reddit.com/r/SideProject/new`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Official OAuth2 REST API (Reddit Developer Platform)
- **AUTH_REQUIRED**: `YES` (OAuth2 script app credentials)
- **RATE_LIMIT**: 60 requests / minute.
- **TERMS_ACCESS_CONSTRAINTS**: Reddit Developer Terms (strictly no scraping outside official API; caching rules apply).
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Use official API only.
- **EXPECTED_SIGNAL**: `COMMUNITY_DEMAND` & `PRODUCT_LAUNCH` (User problem validation, honest critiques, pain points).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Very High (Unfiltered community feedback, willingness-to-pay signals).
- **SELF_REPORTED_DATA_RISK**: High (Self-promotion, subjective user feedback).
- **DUPLICATION_RISK**: Medium.
- **PRIVACY_RISK**: Medium (Redact username authors, ingest only submission text and links).
- **LEGAL_TOS_RISK**: Medium (Strict Reddit commercial API rules require compliance).
- **IMPLEMENTATION_COMPLEXITY**: Medium (OAuth2 token exchange and refresh).
- **RECOMMENDED_INITIAL_PRIORITY**: `HIGH` (Crucial for uncurated market demand signal).
- **PROPOSED_STATE**: `CANDIDATE`

### Source 4: Indie Hackers Public Feed
- **OFFICIAL_URL_OR_API**: `https://www.indiehackers.com/feed`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public RSS / XML Feed
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: 1 req / 5 min bounded polling.
- **TERMS_ACCESS_CONSTRAINTS**: Public RSS syndication.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Respect standard crawl delays.
- **EXPECTED_SIGNAL**: `PUBLIC_TRACTION` (Milestone updates, founder building logs).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Medium (Self-reported MRR and milestone claims).
- **SELF_REPORTED_DATA_RISK**: High (Self-reported revenue figures cannot be independently audited).
- **DUPLICATION_RISK**: Low/Medium.
- **PRIVACY_RISK**: Low (Public milestone headlines).
- **LEGAL_TOS_RISK**: Very Low (Standard public RSS syndication).
- **IMPLEMENTATION_COMPLEXITY**: Low (Standard XML / RSS parser).
- **RECOMMENDED_INITIAL_PRIORITY**: `MEDIUM`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 5: Y Combinator Startup Directory
- **OFFICIAL_URL_OR_API**: `https://www.ycombinator.com/companies`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public Directory / JSON Endpoint
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: 1 req / hour bounded ingest.
- **TERMS_ACCESS_CONSTRAINTS**: Public directory terms; no high-frequency scraping.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Strict cache boundary, daily snapshot only.
- **EXPECTED_SIGNAL**: `STARTUP_VALIDATION` (Cohort admission, team pedigree, high-conviction problem spaces).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM` (Vetted institutional backing).
- **EVIDENCE_VALUE**: High (Filtered startup concepts with top-tier incubator backing).
- **SELF_REPORTED_DATA_RISK**: Low (Verified batch cohort membership).
- **DUPLICATION_RISK**: Low.
- **PRIVACY_RISK**: Low (Public corporate profiles).
- **LEGAL_TOS_RISK**: Low (Low-frequency directory indexing).
- **IMPLEMENTATION_COMPLEXITY**: Medium (JSON extraction).
- **RECOMMENDED_INITIAL_PRIORITY**: `HIGH` (Essential for institutional validation tier).
- **PROPOSED_STATE**: `CANDIDATE`

### Source 6: Devpost Hackathon Winners Feed
- **OFFICIAL_URL_OR_API**: `https://devpost.com/software`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public Feed / RSS
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: Bounded weekly / daily ingest.
- **TERMS_ACCESS_CONSTRAINTS**: Devpost terms of service.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Standard robots.txt guidelines.
- **EXPECTED_SIGNAL**: `MARKET_GAP` & `PRODUCT_LAUNCH` (Emerging tech prototypes, novel API integrations).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Medium (Working hackathon proof-of-concept prototypes).
- **SELF_REPORTED_DATA_RISK**: Low/Medium (Evaluated and judged hackathon submissions).
- **DUPLICATION_RISK**: Very Low.
- **PRIVACY_RISK**: Low (Public hackathon entries).
- **LEGAL_TOS_RISK**: Very Low.
- **IMPLEMENTATION_COMPLEXITY**: Low.
- **RECOMMENDED_INITIAL_PRIORITY**: `MEDIUM`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 7: BetaList Pre-launch Directory
- **OFFICIAL_URL_OR_API**: `https://betalist.com/feed`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public RSS / XML Feed
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: 1 req / hour.
- **TERMS_ACCESS_CONSTRAINTS**: Public RSS terms.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Standard RSS fetch.
- **EXPECTED_SIGNAL**: `PRODUCT_LAUNCH` (Pre-launch beta invitations).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Medium (Early product ideation before formal launch).
- **SELF_REPORTED_DATA_RISK**: Medium (Idea stage).
- **DUPLICATION_RISK**: Medium.
- **PRIVACY_RISK**: Low.
- **LEGAL_TOS_RISK**: Very Low.
- **IMPLEMENTATION_COMPLEXITY**: Low.
- **RECOMMENDED_INITIAL_PRIORITY**: `LOW`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 8: SourceForge FOSS Directory
- **OFFICIAL_URL_OR_API**: `https://sourceforge.net/directory`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public RSS & REST JSON
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: Bounded 1 req / min.
- **TERMS_ACCESS_CONSTRAINTS**: Public FOSS directory terms.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Standard robots.txt.
- **EXPECTED_SIGNAL**: `DEVELOPER_TRACTION` (Open source desktop & server tools).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Low/Medium (Traditional open-source downloads).
- **SELF_REPORTED_DATA_RISK**: Low.
- **DUPLICATION_RISK**: Low.
- **PRIVACY_RISK**: Low.
- **LEGAL_TOS_RISK**: Very Low.
- **IMPLEMENTATION_COMPLEXITY**: Low.
- **RECOMMENDED_INITIAL_PRIORITY**: `LOW`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 9: Launching Next Feed
- **OFFICIAL_URL_OR_API**: `https://www.launchingnext.com/feed`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public RSS
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: Bounded 1 req / hour.
- **TERMS_ACCESS_CONSTRAINTS**: Public RSS.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Standard RSS.
- **EXPECTED_SIGNAL**: `PRODUCT_LAUNCH` (Curated startup directory).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Medium.
- **SELF_REPORTED_DATA_RISK**: Medium.
- **DUPLICATION_RISK**: Medium.
- **PRIVACY_RISK**: Low.
- **LEGAL_TOS_RISK**: Very Low.
- **IMPLEMENTATION_COMPLEXITY**: Low.
- **RECOMMENDED_INITIAL_PRIORITY**: `LOW`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 10: F6S Startup & Accelerator Feed
- **OFFICIAL_URL_OR_API**: `https://www.f6s.com/programs`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public Directory / Feeds
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: Bounded daily sync.
- **TERMS_ACCESS_CONSTRAINTS**: F6S Terms of Service.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Low frequency crawl.
- **EXPECTED_SIGNAL**: `STARTUP_VALIDATION` (Accelerator applications & pitching startups).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM`
- **EVIDENCE_VALUE**: Medium.
- **SELF_REPORTED_DATA_RISK**: Medium.
- **DUPLICATION_RISK**: Low.
- **PRIVACY_RISK**: Low.
- **LEGAL_TOS_RISK**: Low.
- **IMPLEMENTATION_COMPLEXITY**: Medium.
- **RECOMMENDED_INITIAL_PRIORITY**: `MEDIUM`
- **PROPOSED_STATE**: `CANDIDATE`

### Source 11: Techstars Public Portfolio Directory
- **OFFICIAL_URL_OR_API**: `https://www.techstars.com/portfolio`
- **SOURCE_TYPE**: `REAL_EXTERNAL`
- **ACCESS_METHOD**: Public Directory Index
- **AUTH_REQUIRED**: `NO`
- **RATE_LIMIT**: Bounded weekly sync.
- **TERMS_ACCESS_CONSTRAINTS**: Public directory terms.
- **ROBOTS_OR_SCRAPING_CONSTRAINTS**: Cache bounded.
- **EXPECTED_SIGNAL**: `STARTUP_VALIDATION` & `COMPANY_VALIDATION` (Techstars alumni & active cohort companies).
- **EVIDENCE_CLASS**: `SOURCE_CLAIM` (Institutional validation).
- **EVIDENCE_VALUE**: High.
- **SELF_REPORTED_DATA_RISK**: Low (Verified portfolio entries).
- **DUPLICATION_RISK**: Low.
- **PRIVACY_RISK**: Low.
- **LEGAL_TOS_RISK**: Very Low.
- **IMPLEMENTATION_COMPLEXITY**: Medium.
- **RECOMMENDED_INITIAL_PRIORITY**: `MEDIUM`
- **PROPOSED_STATE**: `CANDIDATE`

---

## 3. Recommended Initial Activation Batch (3–5 Sources)

To construct a high-signal, complementary, low-legal-risk portfolio alongside **Hacker News (Show HN)**, the following **4 complementary sources** are recommended for initial authorization by Commander:

1. **GitHub Search / Trending API** (`DEVELOPER_TRACTION` — Platform facts, tamper-proof stars/commits)
2. **Product Hunt API v2** (`PRODUCT_LAUNCH` — Curated launch claims & maker interaction)
3. **Reddit (r/SideProject & r/SaaS)** (`COMMUNITY_DEMAND` — Unfiltered user problem validation & critique)
4. **Y Combinator Startup Directory** (`STARTUP_VALIDATION` — High-conviction cohort admission signals)

This combination covers 4 distinct evidence classes without duplicate announcement spam and operates entirely within official APIs and public directory terms.
