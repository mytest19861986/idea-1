function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function boundedNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${name} must be a finite number from 0 through 100`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function normalizeCitation(input) {
  if (!input || typeof input !== "object") throw new TypeError("citation must be an object");
  const url = new URL(requiredString(input.url, "citation.url"));
  if (url.protocol !== "https:") throw new TypeError("citation.url must use HTTPS");
  return Object.freeze({
    sourceId: requiredString(input.sourceId, "citation.sourceId"),
    collectedItemId: requiredString(input.collectedItemId, "citation.collectedItemId"),
    url: url.toString()
  });
}

export function createPublicationRecord(input) {
  if (!input || typeof input !== "object") throw new TypeError("publication record is required");
  if (!Array.isArray(input.citations) || input.citations.length === 0) throw new TypeError("at least one citation is required");
  const citations = input.citations.map(normalizeCitation).sort((left, right) => `${left.sourceId}\u0000${left.collectedItemId}`.localeCompare(`${right.sourceId}\u0000${right.collectedItemId}`));
  const identities = new Set();
  for (const citation of citations) {
    const identity = `${citation.sourceId}\u0000${citation.collectedItemId}`;
    if (identities.has(identity)) throw new TypeError("duplicate citation identity");
    identities.add(identity);
  }
  return Object.freeze({
    schemaVersion: 1,
    publicationState: "DRAFT",
    opportunityId: requiredString(input.opportunityId, "opportunityId"),
    publicationRevision: positiveInteger(input.publicationRevision, "publicationRevision"),
    locale: requiredString(input.locale, "locale"),
    title: requiredString(input.title, "title"),
    summary: requiredString(input.summary, "summary"),
    score: boundedNumber(input.score, "score"),
    generatedAt: isoTimestamp(input.generatedAt, "generatedAt"),
    citations: Object.freeze(citations)
  });
}
