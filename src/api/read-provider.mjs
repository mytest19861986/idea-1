import { parseOpportunityListQuery } from "./read-contract.mjs";

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " is required");
  return value.trim();
}

function copyRecords(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  return records.map((record) => Object.freeze({ ...record }));
}

function publishedAt(record) {
  const value = Date.parse(record.publishedAt ?? "");
  return Number.isNaN(value) ? 0 : value;
}

export function createInMemoryOpportunityReadProvider(records) {
  const snapshot = copyRecords(records);
  return Object.freeze({
    async list(input = {}) {
      const query = input && Object.hasOwn(input, "cursor") && Object.hasOwn(input, "topic") && Object.hasOwn(input, "sort")
        ? input
        : parseOpportunityListQuery(input);
      let candidates = snapshot.filter((record) => record.publicationState === "APPROVED");
      if (query.topic) candidates = candidates.filter((record) => record.topic === query.topic);
      candidates.sort((left, right) => query.sort === "SCORE_DESC"
        ? (Number(right.score) || 0) - (Number(left.score) || 0)
        : publishedAt(right) - publishedAt(left));
      const after = query.cursor ? candidates.findIndex((record) => record.slug === query.cursor) + 1 : 0;
      const items = candidates.slice(after, after + query.limit);
      const next = candidates[after + query.limit];
      return Object.freeze({ items: Object.freeze(items), nextCursor: next?.slug ?? null });
    },
    async getBySlug(slug) {
      const normalized = required(slug, "slug");
      return snapshot.find((record) => record.publicationState === "APPROVED" && record.slug === normalized) ?? null;
    }
  });
}
