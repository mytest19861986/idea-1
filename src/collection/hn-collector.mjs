/**
 * Hacker News Official Firebase API Controlled Collector
 * Package: PKG-COL-HN-001
 * 
 * Architectural invariants enforced:
 * - HN-G001: Exclusively accesses official Firebase REST API endpoints (https://hacker-news.firebaseio.com/v0/).
 * - HN-G002: Zero credentials required (AUTH_MODEL=NONE). No secrets resolved or required.
 * - HN-G003: Strict client-side concurrency bounding (MAX_CONCURRENT_REQUESTS <= 4) and item bounding (MAX_ITEMS_PER_EXECUTION <= 25).
 * - HN-G004: Strict request timeouts, bounded exponential backoff on 5xx, and fail-closed on 4xx.
 * - HN-G005: All scraped attributes tagged strictly as SOURCE_CLAIM (or DERIVED_METRIC). Never promoted to FACT.
 * - HN-G006: Usernames treated as unverified public strings; no automated deanonymization or personal identity enrichment.
 * - HN-G007: Deleted, dead, and null items safely skipped without aborting entire batch.
 * - HN-G008: Zero side effects or mutations on source lifecycle or global registry.
 */

import { collectorIdentity as createCollectorIdentity, normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";
import { createPlatformFetch } from "./platform-fetch.mjs";

const defaultFetchFn = createPlatformFetch();

export const SOURCE_ID = "hacker-news-official-api";
export const COLLECTOR_ID = "hn-firebase-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://hacker-news.firebaseio.com/v0";
export const OFFICIAL_ALLOWED_HOST = "hacker-news.firebaseio.com";

export const DEFAULT_MAX_ITEMS = 10;
export const HARD_MAX_ITEMS = 25;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_INITIAL_BACKOFF_MS = 500;

export const collectorIdentity = createCollectorIdentity({
  sourceId: SOURCE_ID,
  collectorId: COLLECTOR_ID,
  version: COLLECTOR_VERSION
});

export function getCollectorIdentity() {
  return collectorIdentity;
}

export function buildHnItemCanonicalUrl(itemId) {
  if (itemId == null || !Number.isInteger(Number(itemId))) {
    throw new TypeError("itemId must be a valid integer");
  }
  return `https://news.ycombinator.com/item?id=${itemId}`;
}

export function validateEndpointUrl(urlStr) {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== "https:") {
    throw new TypeError(`Forbidden protocol: ${parsed.protocol}. Only HTTPS is permitted.`);
  }
  if (parsed.hostname !== OFFICIAL_ALLOWED_HOST) {
    throw new TypeError(`Forbidden host: ${parsed.hostname}. Only official host '${OFFICIAL_ALLOWED_HOST}' is allowed.`);
  }
  return parsed.toString();
}

/**
 * Normalizes a raw Hacker News item into the authoritative RawDocument format.
 * Invariants:
 *  - Raw fields tagged strictly as SOURCE_CLAIM
 *  - Derived metrics (age, comments_count, velocity) tagged as DERIVED_METRIC
 *  - Zero identity promotion / deanonymization
 */
export function normalizeHnItem(rawItem, { retrievedAt = new Date().toISOString(), discoveredAt = new Date().toISOString() } = {}) {
  if (!rawItem || typeof rawItem !== "object") {
    throw new TypeError("rawItem must be an object");
  }
  if (rawItem.id == null || !Number.isInteger(Number(rawItem.id))) {
    throw new TypeError("rawItem.id must be a valid integer");
  }
  if (rawItem.deleted === true || rawItem.dead === true) {
    return null; // Safe omission of dead/deleted items
  }

  const itemId = Number(rawItem.id);
  const canonicalUrl = buildHnItemCanonicalUrl(itemId);
  const itemType = typeof rawItem.type === "string" ? rawItem.type.trim() : "story";
  const title = typeof rawItem.title === "string" && rawItem.title.trim() ? rawItem.title.trim() : `HN Item ${itemId}`;
  const targetUrl = typeof rawItem.url === "string" && rawItem.url.trim().startsWith("https://") ? rawItem.url.trim() : null;
  const authorUsername = typeof rawItem.by === "string" && rawItem.by.trim() ? rawItem.by.trim() : null;
  const publishedAt = rawItem.time ? new Date(rawItem.time * 1000).toISOString() : retrievedAt;

  const score = rawItem.score != null ? Number(rawItem.score) : 0;
  const descendants = rawItem.descendants != null ? Number(rawItem.descendants) : 0;
  const kidsCount = Array.isArray(rawItem.kids) ? rawItem.kids.length : 0;

  const publishedEpoch = rawItem.time ? rawItem.time * 1000 : Date.parse(publishedAt);
  const retrievedEpoch = Date.parse(retrievedAt);
  const ageHours = Math.max(0.1, (retrievedEpoch - publishedEpoch) / (1000 * 60 * 60));
  const pointsPerHour = Math.round((score / ageHours) * 100) / 100;
  const commentsPerHour = Math.round((descendants / ageHours) * 100) / 100;
  const engagementVelocity = Math.round(((score + descendants * 2) / ageHours) * 100) / 100;

  const metadata = Object.freeze({
    hnItemId: itemId,
    itemType,
    authorUsername,
    platformScore: score,
    totalComments: descendants,
    directRepliesCount: kidsCount,
    externalId: `hn:${itemId}`,
    sourceTimestamp: publishedAt,
    claims: Object.freeze({
      claim_type: "SOURCE_CLAIM",
      title,
      url: targetUrl,
      by: authorUsername,
      score,
      descendants,
      time: publishedAt
    }),
    derivedMetrics: Object.freeze({
      classification: "DERIVED_METRIC",
      ageHours,
      pointsPerHour,
      commentsPerHour,
      engagementVelocity
    }),
    provenance: Object.freeze({
      collectorId: COLLECTOR_ID,
      collectorVersion: COLLECTOR_VERSION,
      source: SOURCE_ID,
      claim_policy: "SOURCE_CLAIM",
      auth_model: "NONE"
    })
  });

  return normalizeRawDocument({
    sourceId: SOURCE_ID,
    sourceType: "public_community_feed",
    canonicalUrl,
    title,
    rawText: JSON.stringify(rawItem),
    contentReference: targetUrl,
    author: authorUsername,
    publishedAt,
    discoveredAt,
    retrievedAt,
    countryHint: null,
    language: "en",
    metadata
  });
}

/**
 * Creates an authorized Hacker News Collector instance with bounded network operations.
 */
export function createHnCollector({
  baseUrl = DEFAULT_BASE_URL,
  maxItems = DEFAULT_MAX_ITEMS,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_RETRY_COUNT,
  fetchFn = defaultFetchFn,
  logger = null
} = {}) {
  if (!fetchFn || typeof fetchFn !== "function") {
    throw new TypeError("fetchFn must be a function");
  }

  const boundedMaxItems = Math.min(Math.max(1, Number(maxItems) || DEFAULT_MAX_ITEMS), HARD_MAX_ITEMS);
  const boundedConcurrency = Math.min(Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY), DEFAULT_CONCURRENCY);

  validateEndpointUrl(baseUrl);

  const logEvent = (name, data = {}) => {
    if (logger && typeof logger.log === "function") {
      try {
        logger.log({ event: name, timestamp: new Date().toISOString(), ...data });
      } catch (_) {}
    }
  };

  async function fetchWithRetry(urlStr, attempt = 1) {
    validateEndpointUrl(urlStr);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logEvent("hn_collector_http_request", { url: urlStr, attempt });
      const response = await fetchFn(urlStr, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "GlobalOpportunityIntelligence/1.0 (Controlled-Collector-PKG-COL-HN-001)"
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        const status = response.status;
        if (status >= 500 && status <= 599 && attempt <= maxRetries) {
          const backoff = DEFAULT_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          logEvent("hn_collector_retryable_error", { status, attempt, nextRetryMs: backoff });
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return fetchWithRetry(urlStr, attempt + 1);
        }

        return Object.freeze({
          ok: false,
          failure: retrievalFailure({
            kind: status >= 500 ? "RETRYABLE" : (status === 429 ? "RATE_LIMITED" : "FINAL"),
            message: `Hacker News API HTTP ${status} for ${urlStr}`
          })
        });
      }

      const json = await response.json();
      return Object.freeze({ ok: true, data: json });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === "AbortError";
      if (attempt <= maxRetries) {
        const backoff = DEFAULT_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        logEvent("hn_collector_network_retry", { error: err.message, isAbort, attempt, nextRetryMs: backoff });
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return fetchWithRetry(urlStr, attempt + 1);
      }

      return Object.freeze({
        ok: false,
        failure: retrievalFailure({
          kind: "RETRYABLE",
          message: `Network failure on ${urlStr}: ${err.message}`
        })
      });
    }
  }

  return Object.freeze({
    identity: collectorIdentity,

    async fetchFeed({ feedType = "showstories", limit = boundedMaxItems } = {}) {
      const allowedFeeds = new Set(["showstories", "topstories", "newstories", "jobstories"]);
      if (!allowedFeeds.has(feedType)) {
        throw new TypeError(`Unsupported feedType '${feedType}'. Allowed: ${Array.from(allowedFeeds).join(", ")}`);
      }

      const fetchLimit = Math.min(Math.max(1, Number(limit) || boundedMaxItems), boundedMaxItems);
      const feedUrl = `${baseUrl}/${feedType}.json`;
      logEvent("hn_collector_feed_fetch_started", { feedType, limit: fetchLimit });

      const feedRes = await fetchWithRetry(feedUrl);
      if (!feedRes.ok) {
        logEvent("hn_collector_feed_fetch_failed", { error: feedRes.failure });
        return Object.freeze({ ok: false, failure: feedRes.failure, documents: Object.freeze([]) });
      }

      const itemIds = Array.isArray(feedRes.data) ? feedRes.data.slice(0, fetchLimit) : [];
      logEvent("hn_collector_feed_item_ids_retrieved", { count: itemIds.length });

      const retrievedAt = new Date().toISOString();
      const discoveredAt = retrievedAt;
      const documents = [];

      // Concurrency-bounded item retrieval
      const queue = [...itemIds];
      const workers = Array.from({ length: Math.min(boundedConcurrency, queue.length) }, async () => {
        while (queue.length > 0) {
          const itemId = queue.shift();
          if (itemId == null) continue;
          const itemUrl = `${baseUrl}/item/${itemId}.json`;
          const itemRes = await fetchWithRetry(itemUrl);
          if (itemRes.ok && itemRes.data) {
            const normalized = normalizeHnItem(itemRes.data, { retrievedAt, discoveredAt });
            if (normalized) {
              documents.push(normalized);
              logEvent("hn_collector_item_normalized", { itemId, title: normalized.title });
            } else {
              logEvent("hn_collector_item_skipped", { itemId, reason: "deleted_or_dead" });
            }
          } else {
            logEvent("hn_collector_item_fetch_failed", { itemId, failure: itemRes.failure });
          }
        }
      });

      await Promise.all(workers);
      logEvent("hn_collector_feed_fetch_completed", { totalCollected: documents.length });

      return Object.freeze({
        ok: true,
        documents: Object.freeze(documents),
        yieldCount: documents.length,
        retrievedAt
      });
    }
  });
}
