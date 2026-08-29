Exit code: 0
Wall time: 0.3 seconds
Output:
## src/observability/event.mjs
~~~js
const secretKeyPattern = /(password|secret|token|authorization|cookie|credential|api[-_]?key)/i;

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function normalizeOccurredAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError("occurredAt must be a valid timestamp");
  return date.toISOString();
}

function normalizeMetadata(value) {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("metadata must be an object");
  const metadata = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || secretKeyPattern.test(key)) throw new TypeError("metadata key is not allowed");
    if (!["string", "number", "boolean"].includes(typeof item) || (typeof item === "number" && !Number.isFinite(item))) throw new TypeError("metadata values must be finite scalars");
    metadata[key] = item;
  }
  return Object.freeze(Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))));
}

export function createObservableEvent(input) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  return Object.freeze({
    schemaVersion: 1,
    type: requireText(input.type, "type").toUpperCase(),
    correlationId: requireText(input.correlationId, "correlationId"),
    occurredAt: normalizeOccurredAt(input.occurredAt),
    metadata: normalizeMetadata(input.metadata)
  });
}
~~~

