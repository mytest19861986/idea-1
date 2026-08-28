export function rankOpportunities(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const ids = new Set();
  const normalized = items.map((item) => {
    if (!item || typeof item.opportunityId !== "string" || item.opportunityId.trim() === "") throw new TypeError("opportunityId is required");
    if (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 100) throw new TypeError("score must be a finite number from 0 through 100");
    const opportunityId = item.opportunityId.trim();
    if (ids.has(opportunityId)) throw new TypeError("opportunityId must be unique");
    ids.add(opportunityId);
    return { ...item, opportunityId };
  });
  return Object.freeze(normalized.sort((left, right) => right.score - left.score || left.opportunityId.localeCompare(right.opportunityId)).map((item, index) => Object.freeze({ ...item, rank: index + 1 })));
}
