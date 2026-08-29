import { normalizeClaim } from "../analysis/claims.mjs";

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError("extractedAt must be a valid timestamp");
  return date.toISOString();
}

export function normalizeAiExtraction(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  if (!Array.isArray(input.claims)) throw new TypeError("claims must be an array");
  return Object.freeze({
    schemaVersion: 1,
    provider: requireText(input.provider, "provider"),
    promptVersion: requireText(input.promptVersion, "promptVersion"),
    sourceDocumentId: requireText(input.sourceDocumentId, "sourceDocumentId"),
    extractedAt: normalizeTimestamp(input.extractedAt),
    claims: Object.freeze(input.claims.map(normalizeClaim))
  });
}
