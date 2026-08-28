export function deduplicateCollectedItems(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const item of items) {
    if (!item?.sourceId || !item?.externalId || !item?.url) throw new TypeError("item requires sourceId, externalId, and url");
    const key = `${item.sourceId}\u0000${item.externalId}`;
    if (seen.has(key)) duplicates.push(item); else { seen.add(key); unique.push(item); }
  }
  return Object.freeze({ unique: Object.freeze(unique), duplicates: Object.freeze(duplicates) });
}
