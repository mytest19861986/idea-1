const DeliveryStatus = Object.freeze({ DELIVERED: "DELIVERED", FAILED: "FAILED" });

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

export { DeliveryStatus };

export function createDeliveryResult(request, input) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
  const publicationRevision = positiveInteger(request.publicationRevision, "request.publicationRevision");
  requiredString(request.channel, "request.channel");
  requiredString(request.idempotencyKey, "request.idempotencyKey");
  if (!input || typeof input !== "object") throw new TypeError("delivery result is required");
  const status = requiredString(input.status, "status").toUpperCase();
  if (!Object.values(DeliveryStatus).includes(status)) throw new TypeError("delivery status is not supported");
  const result = {
    schemaVersion: 1,
    opportunityId: request.opportunityId,
    publicationRevision,
    channel: request.channel,
    idempotencyKey: request.idempotencyKey,
    status,
    occurredAt: isoTimestamp(input.occurredAt, "occurredAt")
  };
  if (status === DeliveryStatus.DELIVERED) result.channelReference = requiredString(input.channelReference, "channelReference");
  if (status === DeliveryStatus.FAILED) result.failureCode = requiredString(input.failureCode, "failureCode");
  return Object.freeze(result);
}
