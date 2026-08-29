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
  const citations = Array.isArray(record.citations) ? record.citations : [];
  if (!record.slug || !record.title || !record.summary || citations.length === 0) throw new TypeError("public record is incomplete");
  return Object.freeze({ slug: text(record.slug, "slug"), title: text(record.title, "title"), summary: text(record.summary, "summary"), score: record.score, facts: Object.freeze(Array.isArray(record.facts) ? record.facts : []), inferences: Object.freeze(Array.isArray(record.inferences) ? record.inferences : []), citations: Object.freeze(citations.map(({ sourceId, url }) => Object.freeze({ sourceId: text(sourceId, "citation.sourceId"), url: new URL(text(url, "citation.url")).toString() }))) });
}
