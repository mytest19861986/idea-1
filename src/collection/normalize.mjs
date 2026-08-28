function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

export function normalizeCollectedItem(input, { sourceId, collectedAt = new Date().toISOString() } = {}) {
  requiredString(sourceId, "sourceId");
  if (!input || typeof input !== "object") throw new TypeError("collected item is required");
  const url = new URL(requiredString(input.url, "url"));
  if (url.protocol !== "https:") throw new TypeError("collected item URL must use HTTPS");
  return Object.freeze({
    sourceId,
    externalId: typeof input.externalId === "string" && input.externalId.trim() ? input.externalId.trim() : url.toString(),
    url: url.toString(),
    title: requiredString(input.title, "title"),
    summary: typeof input.summary === "string" ? input.summary.trim() : "",
    collectedAt,
    schemaVersion: 1
  });
}
