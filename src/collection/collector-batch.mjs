import { normalizeCollectedItem } from "./normalize.mjs";

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function normalizeCollectedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError("collectedAt must be a valid timestamp");
  return date.toISOString();
}

export function normalizeCollectorBatch(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  if (!Array.isArray(input.items)) throw new TypeError("items must be an array");
  const sourceId = requireText(input.sourceId, "sourceId");
  const collectedAt = normalizeCollectedAt(input.collectedAt);
  return Object.freeze({
    schemaVersion: 1,
    sourceId,
    collectedAt,
    items: Object.freeze(input.items.map((item) => normalizeCollectedItem(item, { sourceId, collectedAt })))
  });
}
