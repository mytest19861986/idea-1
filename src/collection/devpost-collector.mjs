import { collectorIdentity as createCollectorIdentity, normalizeRawDocument, retrievalFailure } from "./collector-contract.mjs";
import { createPlatformFetch } from "./platform-fetch.mjs";

const defaultFetchFn = createPlatformFetch();

export const SOURCE_ID = "devpost-software-feed";
export const COLLECTOR_ID = "devpost-html-collector";
export const COLLECTOR_VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://devpost.com/software";
export const OFFICIAL_ALLOWED_HOST = "devpost.com";

export const DEFAULT_MAX_ITEMS = 10;
export const HARD_MAX_ITEMS = 25;
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_RETRY_COUNT = 3;

export const collectorIdentity = createCollectorIdentity({
  sourceId: SOURCE_ID,
  collectorId: COLLECTOR_ID,
  version: COLLECTOR_VERSION
});

export function getCollectorIdentity() {
  return collectorIdentity;
}

export function buildDevpostCanonicalUrl(slug) {
  if (!slug || typeof slug !== "string" || !slug.trim()) {
    throw new TypeError("slug must be a valid non-empty string");
  }
  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return `https://devpost.com/software/${cleanSlug}`;
}

export function parseDevpostSoftwareListHtml(htmlString) {
  if (!htmlString || typeof htmlString !== "string") {
    return [];
  }

  const items = [];
  // Regex to extract software entries from Devpost HTML markup
  const itemRegex = /<a[^>]+href="https:\/\/devpost\.com\/software\/([a-zA-Z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const titleRegex = /<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/i;
  const taglineRegex = /<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([\s\S]*?)<\/p>/i;

  const seenSlugs = new Set();
  let match;

  while ((match = itemRegex.exec(htmlString)) !== null) {
    const slug = match[1];
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const innerHtml = match[2];
    const titleMatch = innerHtml.match(titleRegex);
    const taglineMatch = innerHtml.match(taglineRegex);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : slug;
    const tagline = taglineMatch ? taglineMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    items.push({
      slug,
      title: title || slug,
      tagline: tagline || "Devpost Hackathon Project",
      canonicalUrl: buildDevpostCanonicalUrl(slug)
    });

    if (items.length >= HARD_MAX_ITEMS) break;
  }

  return items;
}

export function normalizeDevpostItem(rawItem, { retrievedAt = new Date().toISOString(), discoveredAt = new Date().toISOString() } = {}) {
  if (!rawItem || typeof rawItem !== "object") {
    throw new TypeError("rawItem must be an object");
  }
  if (!rawItem.slug) {
    throw new TypeError("rawItem.slug is required");
  }

  const canonicalUrl = buildDevpostCanonicalUrl(rawItem.slug);
  const title = typeof rawItem.title === "string" && rawItem.title.trim() ? rawItem.title.trim() : rawItem.slug;
  const description = rawItem.tagline || rawItem.description || "Devpost Software Showcase";
  const externalDomain = rawItem.externalDomain || null;
  const githubUrl = rawItem.githubUrl || null;

  return normalizeRawDocument({
    sourceId: SOURCE_ID,
    sourceType: "PUBLIC_FEED",
    canonicalUrl,
    title,
    rawText: `${title} - ${description}`,
    contentReference: canonicalUrl,
    author: rawItem.author || "Devpost Builder",
    publishedAt: rawItem.publishedAt || retrievedAt,
    discoveredAt,
    retrievedAt,
    countryHint: "GLOBAL",
    language: "en",
    metadata: {
      sourceRecordId: rawItem.slug,
      externalProductDomain: externalDomain,
      githubUrl,
      claim_type: "SOURCE_CLAIM"
    }
  });
}

export function createDevpostCollector(options = {}) {
  const {
    fetchFn = defaultFetchFn,
    baseUrl = DEFAULT_BASE_URL,
    maxItems = DEFAULT_MAX_ITEMS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT
  } = options;

  return {
    getIdentity() {
      return collectorIdentity;
    },

    async fetchFeed({ limit = maxItems } = {}) {
      const boundLimit = Math.min(Math.max(1, limit), HARD_MAX_ITEMS);
      let attempts = 0;
      let lastErr = null;

      while (attempts < retryCount) {
        attempts++;
        try {
          const res = await fetchFn(baseUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            },
            timeout: timeoutMs
          });

          if (!res || (res.status !== 200 && res.status !== 202)) {
            const status = res?.status || 500;
            if (status >= 400 && status < 500 && status !== 429) {
              return {
                ok: false,
                failure: retrievalFailure({ kind: "FINAL", message: `Devpost HTTP ${status} Client Error` })
              };
            }
            throw new Error(`Devpost HTTP ${status}`);
          }

          const htmlText = typeof res.text === "function" ? await res.text() : String(res.body || "");
          const parsedList = parseDevpostSoftwareListHtml(htmlText);
          const retrievedAt = new Date().toISOString();

          const documents = parsedList
            .slice(0, boundLimit)
            .map(item => normalizeDevpostItem(item, { retrievedAt }));

          return {
            ok: true,
            documents,
            metadata: {
              totalFetched: documents.length,
              sourceId: SOURCE_ID,
              retrievedAt
            }
          };
        } catch (err) {
          lastErr = err;
          if (attempts < retryCount) {
            await new Promise(r => setTimeout(r, 200 * attempts));
          }
        }
      }

      return {
        ok: false,
        failure: retrievalFailure({
          kind: "RETRYABLE",
          message: `Devpost fetch failed after ${attempts} attempts: ${lastErr?.message}`
        })
      };
    }
  };
}
