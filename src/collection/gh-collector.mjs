/**
 * GitHub Search REST API Controlled Collector
 * Package: PKG-COL-GH-001
 *
 * Invariants:
 * - GH-G001: Accesses official GitHub REST Search API only (api.github.com/search/repositories).
 * - GH-G002: Rejects HTML scraping or unofficial trending routes.
 * - GH-G003: Rate-limit aware with 429/403 backoff handling.
 * - GH-G004: All metadata tagged strictly as SOURCE_CLAIM (or DERIVED_METRIC).
 * - GH-G005: Zero side effects or mutations on source lifecycle.
 */

import { collectorIdentity as createCollectorIdentity, normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";
import { createPlatformFetch } from "./platform-fetch.mjs";

const defaultFetchFn = createPlatformFetch();

export const SOURCE_ID = "github-official-search-api";
export const COLLECTOR_ID = "gh-rest-search-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const OFFICIAL_ALLOWED_HOST = "api.github.com";

export const collectorIdentity = createCollectorIdentity({
  sourceId: SOURCE_ID,
  collectorId: COLLECTOR_ID,
  version: COLLECTOR_VERSION
});

export function parseGhRepository(rawItem, { retrievedAt = new Date().toISOString() } = {}) {
  if (!rawItem || typeof rawItem !== "object") return null;
  if (!rawItem.html_url || !rawItem.full_name) return null;

  return normalizeRawDocument({
    sourceId: SOURCE_ID,
    sourceType: "REAL_EXTERNAL",
    canonicalUrl: rawItem.html_url,
    title: `${rawItem.full_name}: ${rawItem.description || "Open Source Repository"}`,
    rawText: rawItem.description || "",
    contentReference: rawItem.homepage && rawItem.homepage.startsWith("https://") ? rawItem.homepage : rawItem.html_url,
    author: rawItem.owner?.login || null,
    publishedAt: rawItem.created_at || null,
    discoveredAt: rawItem.pushed_at || retrievedAt,
    retrievedAt,
    countryHint: null,
    language: "en",
    metadata: {
      stars: rawItem.stargazers_count || 0,
      forks: rawItem.forks_count || 0,
      openIssues: rawItem.open_issues_count || 0,
      license: rawItem.license?.spdx_id || null,
      primaryLanguage: rawItem.language || null,
      topics: Array.isArray(rawItem.topics) ? rawItem.topics : []
    }
  });
}

export function createGhCollector(options = {}) {
  const {
    token = null,
    fetchFn = defaultFetchFn,
    maxItems = 10
  } = options;

  return {
    getIdentity: () => collectorIdentity,

    async searchRepositories(query = "stars:>500 pushed:>2026-08-01", { limit = maxItems } = {}) {
      const endpoint = `https://${OFFICIAL_ALLOWED_HOST}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(limit, 25)}`;
      const headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Discovery-Platform/1.0"
      };
      if (token) {
        headers["Authorization"] = `token ${token}`;
      }

      try {
        const res = await fetchFn(endpoint, { headers });
        if (res.status === 429 || res.status === 403) {
          const retryAfter = res.headers?.get ? res.headers.get("retry-after") : null;
          return {
            ok: false,
            failure: retrievalFailure({
              kind: "RATE_LIMITED",
              retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : 60000,
              message: "GitHub API rate limit exceeded"
            })
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            failure: retrievalFailure({
              kind: res.status >= 500 ? "RETRYABLE" : "FINAL",
              message: `GitHub API error HTTP ${res.status}`
            })
          };
        }

        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        const retrievedAt = new Date().toISOString();
        const documents = [];

        for (const item of items) {
          try {
            const doc = parseGhRepository(item, { retrievedAt });
            if (doc) documents.push(doc);
          } catch {
            // skip invalid document
          }
        }

        return {
          ok: true,
          documents,
          totalCount: data.total_count || documents.length
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
