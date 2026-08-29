import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_ID,
  COLLECTOR_ID,
  COLLECTOR_VERSION,
  collectorIdentity,
  getCollectorIdentity,
  buildStartupCanonicalUrl,
  isConfidentialListing,
  normalizeTrustMrrStartup,
  parseTrustMrrResponse,
  handleHttpError,
  createTrustMrrCollector,
  API_MAX_PAGE_LIMIT
} from "../src/collection/trustmrr-collector.mjs";

const RETRIEVED_AT = "2026-08-30T00:00:00.000Z";
const DISCOVERED_AT = "2026-08-30T00:00:00.000Z";

const SAMPLE_PUBLIC_STARTUP = {
  slug: "shipfast",
  name: "ShipFast",
  tagline: "NextJS boilerplate for SaaS",
  description: "Launch your startup in days, not weeks",
  website_url: "https://shipfast.example.com",
  mrr: 45000,
  arr: 540000,
  revenue_30d: 48000,
  total_revenue: 1200000,
  for_sale: false,
  verified: true,
  payment_provider: "stripe",
  categories: ["boilerplate", "developer-tools"],
  tech_stack: ["Next.js", "Tailwind", "Stripe", "Supabase"],
  team_size: 1,
  funding_status: "bootstrapped",
  country: "TH",
  founder_name: "Marc Lou",
  created_at: "2023-05-10T12:00:00.000Z"
};

const SAMPLE_CONFIDENTIAL_STARTUP = {
  slug: "stealth-ai-wrapper-99",
  name: "Stealth AI Content Generator",
  tagline: "Confidential B2B AI SaaS",
  website_url: "https://confidential.trustmrr.com",
  mrr: 12000,
  for_sale: false, // Not for sale, but explicitly confidential
  is_confidential: true,
  verified: true,
  payment_provider: "lemonsqueezy",
  categories: ["ai", "marketing"],
  team_size: 2,
  funding_status: "bootstrapped"
};

const SAMPLE_UNSPECIFIED_PROVIDER_STARTUP = {
  slug: "unspecified-app",
  name: "Unspecified App",
  website_url: "https://unspecified.example.com",
  mrr: 1000,
  verified: true, // verified true but payment_provider omitted
  funding_status: "bootstrapped"
};

test("collector identity is deterministic and matches PKG-COL-001 contract", () => {
  assert.deepEqual(collectorIdentity, {
    sourceId: "trustmrr",
    collectorId: "trustmrr-http-collector",
    version: "1.0.0"
  });
  assert.equal(SOURCE_ID, "trustmrr");
  assert.equal(COLLECTOR_ID, "trustmrr-http-collector");
  assert.equal(COLLECTOR_VERSION, "1.0.0");
  assert.deepEqual(getCollectorIdentity(), collectorIdentity);
});

test("canonical URL generation enforces HTTPS and valid slug encoding", () => {
  assert.equal(buildStartupCanonicalUrl("shipfast"), "https://trustmrr.com/startup/shipfast");
  assert.equal(buildStartupCanonicalUrl("my tool 1"), "https://trustmrr.com/startup/my%20tool%201");
  assert.throws(() => buildStartupCanonicalUrl(""), /slug must be a non-empty string/);
  assert.throws(() => buildStartupCanonicalUrl(null), /slug must be a non-empty string/);
});

test("document normalization preserves TRUSTMRR-G001 (SOURCE_CLAIM) and provenance metadata", () => {
  const doc = normalizeTrustMrrStartup(SAMPLE_PUBLIC_STARTUP, {
    retrievedAt: RETRIEVED_AT,
    discoveredAt: DISCOVERED_AT
  });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.sourceId, "trustmrr");
  assert.equal(doc.sourceType, "marketplace_startup_listing");
  assert.equal(doc.canonicalUrl, "https://trustmrr.com/startup/shipfast");
  assert.equal(doc.idempotencyKey, "trustmrr:https://trustmrr.com/startup/shipfast");
  assert.equal(doc.title, "ShipFast");
  assert.equal(doc.author, "Marc Lou");
  assert.equal(doc.countryHint, "TH");
  assert.equal(doc.discoveredAt, DISCOVERED_AT);
  assert.equal(doc.retrievedAt, RETRIEVED_AT);

  // Invariant TRUSTMRR-G001 check
  const financials = doc.metadata.financials;
  assert.equal(financials.claim_type, "SOURCE_CLAIM");
  assert.equal(financials.mrr, 45000);
  assert.equal(financials.arr, 540000);
  assert.equal(financials.provenance.verified_by, "stripe");
  assert.equal(financials.provenance.claim_policy, "SOURCE_CLAIM");

  // Provenance metadata
  assert.equal(doc.metadata.sourceSlug, "shipfast");
  assert.equal(doc.metadata.confidential, false);
});

test("unspecified provider does not fabricate stripe fallback", () => {
  const doc = normalizeTrustMrrStartup(SAMPLE_UNSPECIFIED_PROVIDER_STARTUP, {
    retrievedAt: RETRIEVED_AT,
    discoveredAt: DISCOVERED_AT
  });
  assert.equal(doc.metadata.paymentProvider, "verified_unspecified_provider");
  assert.equal(doc.metadata.financials.provenance.verified_by, "verified_unspecified_provider");
});

test("confidential listing isolation strictly enforces TRUSTMRR-G003 regardless of for_sale flag", () => {
  const isConf = isConfidentialListing(SAMPLE_CONFIDENTIAL_STARTUP);
  assert.equal(isConf, true);

  const doc = normalizeTrustMrrStartup(SAMPLE_CONFIDENTIAL_STARTUP, {
    retrievedAt: RETRIEVED_AT,
    discoveredAt: DISCOVERED_AT
  });

  assert.equal(doc.metadata.confidential, true);
  assert.equal(doc.metadata.is_confidential, true);
  // Content reference (website) is nullified to prevent accidental domain linkage
  assert.equal(doc.contentReference, null);
});

test("response parsing handles bounded pagination and nextCursor", () => {
  const payload = {
    startups: [SAMPLE_PUBLIC_STARTUP],
    meta: { total: 25, page: 1, limit: 10, hasMore: true }
  };

  const parsed = parseTrustMrrResponse(payload, {
    retrievedAt: RETRIEVED_AT,
    discoveredAt: DISCOVERED_AT,
    currentPage: 1
  });

  assert.equal(parsed.documents.length, 1);
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.nextCursor, "2");
  assert.equal(parsed.pagination.nextPage, 2);
  assert.equal(parsed.pagination.limit, 10);
});

test("error handler classifies 429 (rate-limit), 5xx (retryable), and 4xx (final)", () => {
  const rateLimit = handleHttpError(429, { "retry-after": "5" }, "Too many requests");
  assert.equal(rateLimit.kind, "RATE_LIMITED");
  assert.equal(rateLimit.retryEligible, true);
  assert.equal(rateLimit.retryAfterMs, 5000);

  const serverErr = handleHttpError(503, {}, "Service Unavailable");
  assert.equal(serverErr.kind, "RETRYABLE");
  assert.equal(serverErr.retryEligible, true);

  const clientErr = handleHttpError(404, {}, "Not Found");
  assert.equal(clientErr.kind, "FINAL");
  assert.equal(clientErr.retryEligible, false);
});

test("mockable collector executes bounded single page fetch with retryable transport handling", async () => {
  const mockFetch = async (url) => {
    assert.match(url, /page=1/);
    assert.match(url, /limit=10/);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        startups: [SAMPLE_PUBLIC_STARTUP],
        meta: { total: 1, page: 1, limit: 10, hasMore: false }
      })
    };
  };

  const collector = createTrustMrrCollector({ apiKey: "test_key", fetchFn: mockFetch });
  const result = await collector.fetchPage({ page: 1, limit: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.documents.length, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
});
