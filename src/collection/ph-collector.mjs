/**
 * Product Hunt Official GraphQL API v2 Controlled Collector
 * Package: PKG-COL-PH-001
 *
 * Invariants:
 * - PH-G001: Accesses official Product Hunt GraphQL endpoint only (api.producthunt.com/v2/api/graphql).
 * - PH-G002: Requires valid OAuth2 Developer token for outbound calls.
 * - PH-G003: Rate-limit aware with 429 backoff handling.
 * - PH-G004: All launch attributes tagged strictly as SOURCE_CLAIM.
 * - PH-G005: Zero side effects or mutations on source lifecycle.
 */

import { collectorIdentity as createCollectorIdentity, normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";
import { createPlatformFetch } from "./platform-fetch.mjs";

const defaultFetchFn = createPlatformFetch();

export const SOURCE_ID = "product-hunt-official-api";
export const COLLECTOR_ID = "ph-graphql-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const OFFICIAL_ALLOWED_HOST = "api.producthunt.com";
export const GRAPHQL_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

export const collectorIdentity = createCollectorIdentity({
  sourceId: SOURCE_ID,
  collectorId: COLLECTOR_ID,
  version: COLLECTOR_VERSION
});

export function parsePhPost(node, { retrievedAt = new Date().toISOString() } = {}) {
  if (!node || typeof node !== "object") return null;
  if (!node.url || !node.name) return null;

  return normalizeRawDocument({
    sourceId: SOURCE_ID,
    sourceType: "REAL_EXTERNAL",
    canonicalUrl: node.url,
    title: `${node.name}: ${node.tagline || "Product Launch"}`,
    rawText: node.description || node.tagline || "",
    contentReference: node.website && node.website.startsWith("https://") ? node.website : node.url,
    author: node.user?.username || null,
    publishedAt: node.createdAt || null,
    discoveredAt: node.featuredAt || retrievedAt,
    retrievedAt,
    countryHint: null,
    language: "en",
    metadata: {
      votesCount: node.votesCount || 0,
      commentsCount: node.commentsCount || 0,
      topics: Array.isArray(node.topics?.edges) ? node.topics.edges.map(e => e.node?.name).filter(Boolean) : []
    }
  });
}

export function createPhCollector(options = {}) {
  const {
    developerToken = null,
    fetchFn = defaultFetchFn,
    maxItems = 10
  } = options;

  return {
    getIdentity: () => collectorIdentity,

    async fetchDailyPosts({ limit = maxItems } = {}) {
      if (!developerToken) {
        return {
          ok: false,
          failure: retrievalFailure({
            kind: "FINAL",
            message: "MISSING_CREDENTIAL: developerToken is required for Product Hunt GraphQL API"
          })
        };
      }

      const query = `
        query GetDailyPosts($first: Int!) {
          posts(first: $first, order: RANKING) {
            edges {
              node {
                id
                name
                tagline
                description
                url
                website
                votesCount
                commentsCount
                createdAt
                featuredAt
                user { username }
                topics { edges { node { name } } }
              }
            }
          }
        }
      `;

      try {
        const res = await fetchFn(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${developerToken}`,
            "User-Agent": "Discovery-Platform/1.0"
          },
          body: JSON.stringify({ query, variables: { first: Math.min(limit, 20) } })
        });

        if (res.status === 429) {
          return {
            ok: false,
            failure: retrievalFailure({
              kind: "RATE_LIMITED",
              retryAfterMs: 60000,
              message: "Product Hunt API rate limit exceeded"
            })
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            failure: retrievalFailure({
              kind: res.status >= 500 ? "RETRYABLE" : "FINAL",
              message: `Product Hunt API error HTTP ${res.status}`
            })
          };
        }

        const data = await res.json();
        const edges = data?.data?.posts?.edges || [];
        const retrievedAt = new Date().toISOString();
        const documents = [];

        for (const edge of edges) {
          try {
            const doc = parsePhPost(edge.node, { retrievedAt });
            if (doc) documents.push(doc);
          } catch {
            // skip invalid
          }
        }

        return {
          ok: true,
          documents,
          totalCount: documents.length
        };
      } catch (err) {
        return {
          ok: false,
          failure: retrievalFailure({
            kind: "RETRYABLE",
            message: err.message || "Network transport error"
          })
        };
      }
    }
  };
}
