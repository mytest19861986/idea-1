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

import { collectorIdentity as createCollectorIdentity, normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";

export const SOURCE_ID = "trustmrr";
export const COLLECTOR_ID = "trustmrr-http-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://trustmrr.com/api/v1";
export const CANONICAL_SITE_ORIGIN = "https://trustmrr.com";

export const API_MAX_PAGE_LIMIT = 10;
export const DEFAULT_RATE_LIMIT_BACKOFF_MS = 3000; // 20 req/min baseline

export const collectorIdentity = createCollectorIdentity({
  sourceId: SOURCE_ID,
  collectorId: COLLECTOR_ID,
  version: COLLECTOR_VERSION
});

export function getCollectorIdentity() {
  return collectorIdentity;
}

export function buildStartupCanonicalUrl(slug) {
  if (typeof slug !== "string" || !slug.trim()) {
    throw new TypeError("slug must be a non-empty string");
  }
  const cleanSlug = encodeURIComponent(slug.trim());
  return `${CANONICAL_SITE_ORIGIN}/startup/${cleanSlug}`;
}

export function isConfidentialListing(rawStartup) {
  if (!rawStartup || typeof rawStartup !== "object") return false;
  if (rawStartup.for_sale === true && (rawStartup.is_confidential === true || rawStartup.confidential === true)) {
    return true;
  }
  const website = (rawStartup.website_url || rawStartup.website || "").trim().toLowerCase();
  if (!website || website.includes("confidential") || website.includes("stealth") || website.includes("hidden")) {
    return true;
  }
  const name = (rawStartup.name || "").trim().toLowerCase();
  if (name.includes("confidential") || name.startsWith("stealth startup") || name.startsWith("stealth company")) {
    return true;
  }
  return false;
}

export function normalizeTrustMrrStartup(rawStartup, { retrievedAt, discoveredAt }) {
  if (!rawStartup || typeof rawStartup !== "object") {
    throw new TypeError("rawStartup must be an object");
  }
  if (!rawStartup.slug || typeof rawStartup.slug !== "string") {
    throw new TypeError("rawStartup.slug must be a non-empty string");
  }
  if (!rawStartup.name || typeof rawStartup.name !== "string") {
    throw new TypeError("rawStartup.name must be a non-empty string");
  }

  const confidential = isConfidentialListing(rawStartup);
  const canonicalUrl = buildStartupCanonicalUrl(rawStartup.slug);
  const paymentProvider = rawStartup.payment_provider || rawStartup.verified_by || (rawStartup.verified ? "stripe" : "none");

  // Invariant TRUSTMRR-G001: Financials are tagged strictly as SOURCE_CLAIM
  const financials = Object.freeze({
    claim_type: "SOURCE_CLAIM",
    mrr: rawStartup.mrr != null ? Number(rawStartup.mrr) : null,
    arr: rawStartup.arr != null ? Number(rawStartup.arr) : (rawStartup.mrr != null ? Number(rawStartup.mrr) * 12 : null),
    revenue_30d: rawStartup.revenue_30d != null ? Number(rawStartup.revenue_30d) : null,
    total_revenue: rawStartup.total_revenue != null ? Number(rawStartup.total_revenue) : null,
    asking_price: rawStartup.asking_price != null ? Number(rawStartup.asking_price) : null,
    growth_mom_pct: rawStartup.growth_mom_pct != null ? Number(rawStartup.growth_mom_pct) : null,
    provenance: Object.freeze({
      verified_by: paymentProvider,
      verified_status: rawStartup.verified ? "VERIFIED_BY_PROVIDER" : "SELF_REPORTED",
      source: SOURCE_ID,
      claim_policy: "SOURCE_CLAIM"
    })
  });

  const metadata = Object.freeze({
    sourceSlug: rawStartup.slug,
    confidential,
    is_confidential: confidential,
    paymentProvider,
    for_sale: Boolean(rawStartup.for_sale),
    categories: Object.freeze(Array.isArray(rawStartup.categories) ? [...rawStartup.categories] : []),
    tech_stack: Object.freeze(Array.isArray(rawStartup.tech_stack) ? [...rawStartup.tech_stack] : []),
    team_size: rawStartup.team_size != null ? Number(rawStartup.team_size) : null,
    funding_status: rawStartup.funding_status || "bootstrapped",
    financials,
    provenance: Object.freeze({
      collectorId: COLLECTOR_ID,
      collectorVersion: COLLECTOR_VERSION,
      claim_policy: "SOURCE_CLAIM"
    })
  });

  return normalizeRawDocument({
    sourceId: SOURCE_ID,
    sourceType: "marketplace_startup_listing",
    canonicalUrl,
    title: rawStartup.name.trim(),
    rawText: JSON.stringify(rawStartup),
    contentReference: confidential ? null : (rawStartup.website_url ? rawStartup.website_url.trim() : null),
    author: rawStartup.founder_name || rawStartup.author || null,
    publishedAt: rawStartup.created_at || rawStartup.founded_date || null,
    discoveredAt,
    retrievedAt,
    countryHint: rawStartup.country || null,
    language: "en",
    metadata
  });
}

export function parseTrustMrrResponse(jsonPayload, { retrievedAt, discoveredAt, currentPage = 1 }) {
  if (!jsonPayload || typeof jsonPayload !== "object") {
    throw new TypeError("jsonPayload must be an object");
  }

  const items = Array.isArray(jsonPayload.startups)
    ? jsonPayload.startups
    : (Array.isArray(jsonPayload.data) ? jsonPayload.data : (Array.isArray(jsonPayload.items) ? jsonPayload.items : []));

  const documents = Object.freeze(items.map((item) => normalizeTrustMrrStartup(item, { retrievedAt, discoveredAt })));
  const meta = jsonPayload.meta || jsonPayload.pagination || {};
  const hasMore = Boolean(meta.hasMore || meta.has_more || (meta.total && meta.page && meta.limit && meta.page * meta.limit < meta.total));
  const nextPage = hasMore ? Number(currentPage) + 1 : null;
  const nextCursor = nextPage ? String(nextPage) : null;

  return Object.freeze({
    documents,
    hasMore,
    nextCursor,
    pagination: Object.freeze({
      currentPage: Number(currentPage),
      nextPage,
      total: meta.total != null ? Number(meta.total) : null,
      limit: meta.limit != null ? Number(meta.limit) : items.length,
      hasMore
    })
  });
}

export function parseRetryAfter(headerValue) {
  if (!headerValue) return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const date = new Date(headerValue);
  if (!Number.isNaN(date.valueOf())) {
    const diff = date.valueOf() - Date.now();
    return diff > 0 ? diff : DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }
  return DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

export function handleHttpError(status, headers = {}, body = "") {
  const code = Number(status);
  const retryHeader = headers["retry-after"] || headers["Retry-After"];

  if (code === 429) {
    return retrievalFailure({
      kind: "RATE_LIMITED",
      retryAfterMs: parseRetryAfter(retryHeader),
      message: `TrustMRR rate limit reached (HTTP 429): ${typeof body === "string" ? body : JSON.stringify(body)}`
    });
  }

  if (code >= 500 && code <= 599) {
    return retrievalFailure({
      kind: "RETRYABLE",
      message: `TrustMRR server error (HTTP ${code}): ${typeof body === "string" ? body : JSON.stringify(body)}`
    });
  }

  return retrievalFailure({
    kind: "FINAL",
    message: `TrustMRR client error (HTTP ${code}): ${typeof body === "string" ? body : JSON.stringify(body)}`
  });
}

export function createTrustMrrCollector({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchFn = globalThis.fetch } = {}) {
  if (!fetchFn || typeof fetchFn !== "function") {
    throw new TypeError("fetchFn must be a function");
  }

  return Object.freeze({
    identity: collectorIdentity,
    async fetchPage({ page = 1, limit = API_MAX_PAGE_LIMIT } = {}) {
      const boundedLimit = Math.min(Number(limit) || API_MAX_PAGE_LIMIT, API_MAX_PAGE_LIMIT);
      const targetPage = Math.max(Number(page) || 1, 1);
      const url = new URL(`${baseUrl}/startups`);
      url.searchParams.set("page", String(targetPage));
      url.searchParams.set("limit", String(boundedLimit));

      const headers = {
        "Accept": "application/json",
        "User-Agent": "GlobalOpportunityIntelligence/1.0 (Controlled-Collector-PKG-COL-002)"
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const retrievedAt = new Date().toISOString();
      const discoveredAt = retrievedAt;

      try {
        const response = await fetchFn(url.toString(), { method: "GET", headers });
        if (!response.ok) {
          const body = typeof response.text === "function" ? await response.text() : "";
          const headerObj = typeof response.headers?.get === "function"
            ? { "retry-after": response.headers.get("retry-after") }
            : (response.headers || {});
          return Object.freeze({
            ok: false,
            failure: handleHttpError(response.status, headerObj, body)
          });
        }

        const data = typeof response.json === "function" ? await response.json() : JSON.parse(await response.text());
        const parsed = parseTrustMrrResponse(data, { retrievedAt, discoveredAt, currentPage: targetPage });
        return Object.freeze({
          ok: true,
          ...parsed
        });
      } catch (err) {
        return Object.freeze({
          ok: false,
          failure: retrievalFailure({
            kind: "RETRYABLE",
            message: `Network transport failure: ${err.message || String(err)}`
          })
        });
      }
    }
  });
}
