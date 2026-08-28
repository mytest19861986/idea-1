function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

export function approvePublication(record, approval) {
  if (!record || typeof record !== "object") throw new TypeError("publication record is required");
  if (record.publicationState !== "DRAFT") throw new RangeError("only DRAFT records may be approved");
  if (!approval || typeof approval !== "object") throw new TypeError("approval is required");
  const actor = requiredString(approval.actor, "approval.actor");
  const reason = requiredString(approval.reason, "approval.reason");
  const approvedAt = isoTimestamp(approval.approvedAt, "approval.approvedAt");
  const event = Object.freeze({
    type: "PUBLICATION_APPROVED",
    opportunityId: requiredString(record.opportunityId, "record.opportunityId"),
    actor,
    reason,
    occurredAt: approvedAt
  });
  return Object.freeze({
    record: Object.freeze({ ...record, publicationState: "APPROVED", publicationApproval: Object.freeze({ actor, reason, approvedAt }) }),
    event
  });
}
