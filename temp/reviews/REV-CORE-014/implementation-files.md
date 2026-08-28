# Full relevant implementation: src/delivery/result.mjs

```js
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

export { DeliveryStatus };

export function createDeliveryResult(request, input) {
  if (!request || typeof request !== "object") throw new TypeError("delivery request is required");
  requiredString(request.opportunityId, "request.opportunityId");
  requiredString(request.channel, "request.channel");
  requiredString(request.idempotencyKey, "request.idempotencyKey");
  if (!input || typeof input !== "object") throw new TypeError("delivery result is required");
  const status = requiredString(input.status, "status").toUpperCase();
  if (!Object.values(DeliveryStatus).includes(status)) throw new TypeError("delivery status is not supported");
  const result = { schemaVersion: 1, opportunityId: request.opportunityId, channel: request.channel, idempotencyKey: request.idempotencyKey, status, occurredAt: isoTimestamp(input.occurredAt, "occurredAt") };
  if (status === DeliveryStatus.DELIVERED) result.channelReference = requiredString(input.channelReference, "channelReference");
  if (status === DeliveryStatus.FAILED) result.failureCode = requiredString(input.failureCode, "failureCode");
  return Object.freeze(result);
}
```
