function timestamp(value) {
  if (typeof value !== "string" || value.trim() === "" || Number.isNaN(Date.parse(value))) throw new TypeError("occurredAt must be an ISO-compatible timestamp");
  return new Date(value).toISOString();
}

export function assessSourceHealth(events, { failureRateThreshold } = {}) {
  if (!Array.isArray(events) || events.length === 0) throw new TypeError("events must be a non-empty array");
  if (typeof failureRateThreshold !== "number" || !Number.isFinite(failureRateThreshold) || failureRateThreshold < 0 || failureRateThreshold > 100) throw new TypeError("failureRateThreshold must be a finite number from 0 through 100");
  const normalized = events.map((event) => {
    if (!event || typeof event.sourceId !== "string" || event.sourceId.trim() === "") throw new TypeError("event.sourceId is required");
    if (typeof event.success !== "boolean") throw new TypeError("event.success must be boolean");
    return { sourceId: event.sourceId.trim(), success: event.success, occurredAt: timestamp(event.occurredAt) };
  });
  const sourceId = normalized[0].sourceId;
  if (normalized.some((event) => event.sourceId !== sourceId)) throw new TypeError("events must belong to one source");
  const failureCount = normalized.filter((event) => !event.success).length;
  const failureRate = Number(((failureCount / normalized.length) * 100).toFixed(2));
  return Object.freeze({ sourceId, eventCount: normalized.length, successCount: normalized.length - failureCount, failureCount, failureRate, latestOccurredAt: normalized.reduce((latest, event) => latest > event.occurredAt ? latest : event.occurredAt, normalized[0].occurredAt), assessment: failureRate > failureRateThreshold ? "DEGRADED" : "HEALTHY" });
}
