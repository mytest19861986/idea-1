const sorts = new Set(["SCORE_DESC", "PUBLISHED_AT_DESC"]);

function text(value, field) { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`); return value.trim(); }
function integer(value, field) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError(`${field} must be a positive integer`); return parsed; }

export function parseOpportunityListQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("query must be an object");
  const limit = input.limit === undefined ? 20 : integer(input.limit, "limit");
  if (limit > 100) throw new RangeError("limit must not exceed 100");
  const sort = input.sort === undefined ? "SCORE_DESC" : text(input.sort, "sort").toUpperCase();
  if (!sorts.has(sort)) throw new TypeError("sort is not supported");
  return Object.freeze({ limit, cursor: input.cursor === undefined ? null : text(input.cursor, "cursor"), sort, topic: input.topic === undefined ? null : text(input.topic, "topic") });
}

export function toPublicOpportunity(record) {
  if (!record || typeof record !== "object" || record.publicationState !== "APPROVED") throw new RangeError("only approved records are publicly readable");

  if (record.isConfidential) {
    return Object.freeze({
      slug: text(record.slug, "slug"),
      title: "[CONFIDENTIAL OPPORTUNITY]",
      summary: "[REDACTED - PRIVILEGED ACCESS REQUIRED]",
      score: null,
      scoringModelVersion: null,
      evidenceConfidence: null,
      confidenceBreakdown: null,
      corroborationStatus: "UNCONFIRMED",
      freshnessStatus: "CURRENT",
      clusterId: null,
      contradictions: Object.freeze([]),
      unknownFactors: Object.freeze([]),
      tractionMetrics: Object.freeze([]),
      competitors: Object.freeze([]),
      marketGaps: Object.freeze([]),
      localization: null,
      monetization: null,
      complexity: null,
      regulatoryRisk: null,
      facts: Object.freeze([]),
      inferences: Object.freeze([]),
      citations: Object.freeze([]),
      isConfidential: true,
      accessState: "REDACTED"
    });
  }

  const citations = Array.isArray(record.citations) ? record.citations : [];
  if (!record.slug || !record.title || !record.summary || citations.length === 0) throw new TypeError("public record is incomplete");
  return Object.freeze({
    slug: text(record.slug, "slug"),
    title: text(record.title, "title"),
    summary: text(record.summary, "summary"),
    score: record.score,
    scoringModelVersion: record.scoringModelVersion || null,
    evidenceConfidence: typeof record.evidenceConfidence === "number" ? record.evidenceConfidence : null,
    confidenceBreakdown: Object.freeze(record.confidenceBreakdown || null),
    corroborationStatus: record.corroborationStatus || "UNCONFIRMED",
    freshnessStatus: record.freshnessStatus || "UNKNOWN",
    clusterId: record.clusterId || null,
    contradictions: Object.freeze(Array.isArray(record.contradictions) ? record.contradictions : []),
    unknownFactors: Object.freeze(Array.isArray(record.unknownFactors) ? record.unknownFactors : []),
    tractionMetrics: Object.freeze(Array.isArray(record.tractionMetrics) ? record.tractionMetrics : []),
    competitors: Object.freeze(Array.isArray(record.competitors) ? record.competitors : []),
    marketGaps: Object.freeze(Array.isArray(record.marketGaps) ? record.marketGaps : []),
    localization: Object.freeze(record.localization || null),
    monetization: Object.freeze(record.monetization || null),
    complexity: Object.freeze(record.complexity || null),
    regulatoryRisk: Object.freeze(record.regulatoryRisk || null),
    facts: Object.freeze(Array.isArray(record.facts) ? record.facts : []),
    inferences: Object.freeze(Array.isArray(record.inferences) ? record.inferences : []),
    citations: Object.freeze(citations.map(({ sourceId, url }) => Object.freeze({ sourceId: text(sourceId, "citation.sourceId"), url: new URL(text(url, "citation.url")).toString() })))
  });
}

