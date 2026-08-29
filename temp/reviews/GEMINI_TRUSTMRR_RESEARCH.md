# TrustMRR Intelligence Inventory & Source Assessment

**Source**: Gemini 3.7 Flash (Primary Research Worker)  
**Package**: `PKG-SRC-EVAL-001`  
**Target Platform**: TrustMRR (https://trustmrr.com)  
**Timestamp**: 2026-08-30

---

## 1. Source Identity & Platform Summary
- **Platform Name**: TrustMRR
- **Canonical URL**: https://trustmrr.com
- **Core Business Model**: A dual-purpose verified startup registry and micro-acquisition marketplace. Basic listing in the verified database is free; monetization occurs via marketplace listing upgrades/promotional tiers, transaction commissions/acquisition fees, and developer API subscriptions.
- **Core Value Proposition**: Eliminates self-reported/faked revenue metrics (e.g., doctored Stripe dashboard screenshots) by connecting directly to payment providers to publicly verify financial benchmarks.
- **Catalog Scale & Coverage**: ~850–1,000+ startups across 80+ countries, skewed heavily toward bootstrapped SaaS, AI wrappers/tools, micro-SaaS, and creator/indie businesses.

---

## 2. Available Public & API Surfaces
- **Base URL**: `https://trustmrr.com/api/v1`
- **Authentication Scheme**: HTTP Bearer Token (`Authorization: Bearer tmrr_...`)
- **Auxiliary Integrations**: Provides direct Model Context Protocol (MCP) server endpoints and `llms.txt` documentation for automated extraction.
- **Endpoints**:
  - `GET /api/v1/startups`: Paginated list of startup records with multi-variable filtering (MRR ranges, revenue bands, asking prices, team size, funding status, category) and sorting (e.g., `mrr_desc`, `growth_desc`, `created_at_desc`).
  - `GET /api/v1/startups/{slug}`: Enriched entity payload including detailed metrics, historical growth, tech stack, and founder metadata.

---

## 3. Data Fields Inventory
| Category | Available Data Fields |
| :--- | :--- |
| **Identity & Descriptive** | `name`, `slug`, `tagline`, `description`, `website_url`, `logo_url`, `founded_date`, `country`/`geography` |
| **Financial Metrics** | `mrr` (Monthly Recurring Revenue), `arr` (computed), `revenue_30d` (trailing 30-day gross), `total_revenue` (all-time aggregate), `charge_count` |
| **Operational Metrics** | `active_subscriptions`, `customer_count`, `churn_rate` (customer & revenue), `growth_mom_pct` (Month-over-Month growth rate) |
| **Marketplace & Deal Data** | `for_sale` (boolean), `asking_price`, `multiple_mrr`, `multiple_arr`, `deal_type` |
| **Taxonomy & Tech** | `categories`, `business_model` (SaaS, e-commerce, digital product), `tech_stack` tags (e.g., Next.js, Supabase, Tailwind, Stripe) |
| **People & Team** | `cofounders` (names, social handles, LinkedIn, Twitter/X profiles), `team_size`, `funding_status` (Bootstrapped vs Funded) |

---

## 4. Revenue & Financial Verification Semantics
- **Verification Architecture**: Programmatic, direct-connection verification. Founders connect payment gateway accounts via OAuth or restricted read-only API keys.
- **Supported Gateways**: Stripe, LemonSqueezy, Paddle, Shopify.
- **Verification Flagging**:
  - `Verified`: Directly computed from active gateway transactions.
  - `Self-Reported/Estimated`: Historical pre-connection entries or manual figures (clearly segmented from API-verified entities).
- **Metric Calculation**: Excludes test charges, accounts for refunds/disputes, distinguishes one-time revenue from true recurring subscription billing (MRR).

---

## 5. Provenance & Attribution Quality
- **Audit Trail**: Direct cryptographic/API linkage to the payment merchant account.
- **Attribution Metadata**: Records include verification source flags (e.g., `verified_by: "stripe"`), timestamp of verification, and ongoing synchronization state.
- **Anomalies / Tampering Resistance**: Significantly higher integrity than screenshot-based platforms; however, it remains vulnerable to artificial transaction generation (founders billing their own credit cards to inflate metrics) if transactional velocity is not audited against dispute/chargeback indices.

---

## 6. Freshness & Update Frequency
- **Sync Interval**: Continuous/periodic background polling and webhook consumption from integrated payment providers.
- **Public Profile Refresh**: Metric caching typically invalidates every 24 to 48 hours for public views, with live recalculation on profile updates.
- **API Latency**: API endpoints surface refreshed figures within 1 sync cycle of payment platform reconciliation.

---

## 7. Coverage, Uniqueness & Geographic/Category Normalization
- **Coverage Scope**: Global geographic distribution (80+ countries), but heavily weighted toward North America and Western Europe indie ecosystems.
- **Category Focus**: AI applications, B2B/B2C SaaS, developer tools, directory sites, and boilerplate/starter kits.
- **Normalization Needs**:
  - Category tags are user-selected with loose platform normalization.
  - Currencies require conversion normalization (gateway metrics normalized to base USD).
  - Country data relies on company registration or founder self-identification.

---

## 8. Signal-to-Noise & Commercial Bias Risks
- **Promotional Bias**: Founders frequently list assets to attract buyers or build backlink/social proof. Revenue can be temporarily spiked via aggressive promotion prior to listing.
- **Survivorship Bias**: The catalog disproportionately represents either active growth phases (founders showing off success) or plateaued/abandoned projects (founders looking to sell via the marketplace).
- **Data Quality Disparity**: High integrity on numeric metrics (`mrr`, `total_revenue`, `churn`), but moderate-to-low integrity on narrative fields (`description`, `future potential`).

---

## 9. Anonymous / Stealth Entity Behavior
- **Public Listings**: The standard database requires domain attribution and business identity for transparency.
- **Confidential Marketplace Listings**: Startups listed for sale can opt for masked/anonymized identity (domain obscured) until an NDA/inquiry is submitted.
- **Deduplication Risk**: Merging TrustMRR records with external intelligence sets requires fuzzy matching on founder social profiles, product names, or domain fingerprints. Masked listings introduce entity collision risks if merged purely on categorical or metric ranges.

---

## 10. Access Model & Rate Limits / Acceptable Use Constraints
- **Authentication**: API keys issued via developer dashboard.
- **Rate Limits**: 20 requests per minute on standard tiers.
- **Usage Rights**: Permitted for programmatic aggregation, benchmarking, and market research. Bulk redistribution of verbatim profiles without attribution is restricted under platform Terms of Service.

---

## 11. Opportunity Intelligence Value
- **High-Value Signals**: Real verified MRR + MoM growth velocity enables early identification of breakout micro-SaaS and AI applications before mainstream tech media coverage.
- **Acquisition / Deal Flow Intelligence**: Financial metrics coupled with asking prices provide live market multiples (MRR multiples) across specific sub-niches.
- **Tech Stack Correlation**: Correlating growth velocity with underlying tech stacks surfaces infrastructure trends and architectural patterns.

---

## 12. Comparable Alternative Sources
- **Acquire.com**: Larger acquisition marketplace volume, but private financials (requires buyer qualification/NDA) and higher proportion of legacy assets.
- **OpenStartup / Indie Hackers**: Primarily self-reported or voluntary Stripe-connected dashboards with higher historical churn and less consistent API access.
- **Latka**: Provides SaaS revenue estimates and founder interviews, but metrics are often manually sourced, annualized estimates, or survey-based rather than real-time gateway verified.
