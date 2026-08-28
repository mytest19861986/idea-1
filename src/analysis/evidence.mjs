const EVIDENCE_TYPES = Object.freeze([
  "DEMAND",
  "GROWTH",
  "ENGAGEMENT",
  "REVENUE"
]);

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

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

export { EVIDENCE_TYPES };

export function normalizeEvidenceRecord(input) {
  if (!input || typeof input !== "object") throw new TypeError("evidence record is required");
  const url = new URL(requiredString(input.url, "url"));
  if (url.protocol !== "https:") throw new TypeError("evidence URL must use HTTPS");
  const evidenceType = requiredString(input.evidenceType, "evidenceType").toUpperCase();
  if (!EVIDENCE_TYPES.includes(evidenceType)) throw new TypeError("evidenceType is not supported");
  return Object.freeze({
    opportunityId: requiredString(input.opportunityId, "opportunityId"),
    sourceId: requiredString(input.sourceId, "sourceId"),
    collectedItemId: requiredString(input.collectedItemId, "collectedItemId"),
    url: url.toString(),
    observedAt: isoTimestamp(input.observedAt, "observedAt"),
    evidenceType,
    strength: boundedNumber(input.strength, "strength"),
    confidence: boundedNumber(input.confidence, "confidence"),
    note: typeof input.note === "string" ? input.note.trim() : ""
  });
}

export function deriveTractionSignals(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const groups = new Map();
  for (const input of records) {
    const record = normalizeEvidenceRecord(input);
    const group = groups.get(record.opportunityId) ?? { records: [], sources: new Set() };
    group.records.push(record);
    group.sources.add(record.sourceId);
    groups.set(record.opportunityId, group);
  }
  return Object.freeze([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([opportunityId, group]) => {
    const confidenceTotal = group.records.reduce((total, record) => total + record.confidence, 0);
    const weightedStrength = group.records.reduce((total, record) => total + (record.strength * record.confidence), 0);
    const tractionScore = confidenceTotal === 0 ? 0 : Number((weightedStrength / confidenceTotal).toFixed(2));
    const latestObservedAt = group.records.reduce((latest, record) => latest > record.observedAt ? latest : record.observedAt, group.records[0].observedAt);
    return Object.freeze({
      opportunityId,
      tractionScore,
      evidenceCount: group.records.length,
      sourceCount: group.sources.size,
      latestObservedAt
    });
  }));
}
