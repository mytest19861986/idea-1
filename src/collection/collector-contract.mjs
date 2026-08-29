const failureKinds = new Set(["RETRYABLE", "FINAL", "RATE_LIMITED", "INVALID_RESPONSE", "UNSUPPORTED_CONTENT"]);
function text(value, field) { if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " is required"); return value.trim(); }
function timestamp(value, field) { const date = new Date(value); if (Number.isNaN(date.valueOf())) throw new TypeError(field + " must be a valid timestamp"); return date.toISOString(); }
function https(value, field) { const url = new URL(text(value, field)); if (url.protocol !== "https:") throw new TypeError(field + " must use HTTPS"); url.hash = ""; return url.toString(); }

export function collectorIdentity({ sourceId, collectorId, version }) {
  return Object.freeze({ sourceId: text(sourceId, "sourceId"), collectorId: text(collectorId, "collectorId"), version: text(version, "version") });
}

export function normalizeRawDocument(input) {
  if (!input || typeof input !== "object") throw new TypeError("document is required");
  const canonicalUrl = https(input.canonicalUrl, "canonicalUrl");
  const sourceId = text(input.sourceId, "sourceId");
  const publishedAt = input.publishedAt == null ? null : timestamp(input.publishedAt, "publishedAt");
  const rawText = input.rawText == null ? null : text(input.rawText, "rawText");
  const contentReference = input.contentReference == null ? null : https(input.contentReference, "contentReference");
  if (!rawText && !contentReference) throw new TypeError("rawText or contentReference is required");
  return Object.freeze({ schemaVersion: 1, sourceId, sourceType: text(input.sourceType, "sourceType"), canonicalUrl, title: text(input.title, "title"), rawText, contentReference, author: input.author == null ? null : text(input.author, "author"), publishedAt, discoveredAt: timestamp(input.discoveredAt, "discoveredAt"), retrievedAt: timestamp(input.retrievedAt, "retrievedAt"), countryHint: input.countryHint == null ? null : text(input.countryHint, "countryHint"), language: text(input.language, "language"), metadata: Object.freeze({ ...(input.metadata ?? {}) }), idempotencyKey: sourceId + ":" + canonicalUrl });
}

export function retrievalFailure(input) {
  const kind = text(input?.kind, "kind"); if (!failureKinds.has(kind)) throw new TypeError("failure kind is unsupported");
  return Object.freeze({ kind, retryEligible: kind === "RETRYABLE" || kind === "RATE_LIMITED", retryAfterMs: kind === "RATE_LIMITED" ? Number(input.retryAfterMs) : null, message: text(input.message, "message") });
}
