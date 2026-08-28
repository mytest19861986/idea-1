export const DeliveryChannel = Object.freeze({ WEB: "WEB", TELEGRAM: "TELEGRAM" });

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isoTimestamp(value, name) {
  const timestamp = requiredString(value, name);
  if (Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
  return new Date(timestamp).toISOString();
}

export function createDeliveryRequest(record, input) {
  if (!record || typeof record !== "object") throw new TypeError("publication record is required");
  if (record.publicationState !== "APPROVED") throw new RangeError("only APPROVED records may request delivery");
  if (!input || typeof input !== "object") throw new TypeError("delivery request is required");
  const channel = requiredString(input.channel, "channel").toUpperCase();
  if (!Object.values(DeliveryChannel).includes(channel)) throw new TypeError("delivery channel is not supported");
  return Object.freeze({
    schemaVersion: 1,
    opportunityId: requiredString(record.opportunityId, "record.opportunityId"),
    channel,
    idempotencyKey: requiredString(input.idempotencyKey, "idempotencyKey"),
    requestedAt: isoTimestamp(input.requestedAt, "requestedAt"),
    record
  });
}
