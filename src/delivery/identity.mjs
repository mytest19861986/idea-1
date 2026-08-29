function text(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function revision(value) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError("publicationRevision must be a positive integer");
  return value;
}

export function deliveryIdentity(input) {
  if (!input || typeof input !== "object") throw new TypeError("delivery identity is required");
  const result = {
    opportunityId: text(input.opportunityId, "opportunityId"),
    publicationRevision: revision(input.publicationRevision),
    channel: text(input.channel, "channel").toUpperCase(),
    idempotencyKey: text(input.idempotencyKey, "idempotencyKey")
  };
  return Object.freeze({ ...result, key: `${result.opportunityId}\u0000${result.publicationRevision}\u0000${result.channel}\u0000${result.idempotencyKey}` });
}
