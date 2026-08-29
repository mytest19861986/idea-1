function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function normalizeObservation(observation) {
  if (!observation || typeof observation !== "object") throw new TypeError("observation must be an object");
  if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) throw new TypeError("observation.value must be a finite number");
  const occurredAt = new Date(observation.occurredAt);
  if (Number.isNaN(occurredAt.valueOf())) throw new TypeError("observation.occurredAt must be a valid timestamp");
  return Object.freeze({ metric: requireText(observation.metric, "observation.metric"), value: observation.value, occurredAt: occurredAt.toISOString() });
}

export function summarizeTrend(observations) {
  if (!Array.isArray(observations) || observations.length < 2) throw new TypeError("observations must contain at least two items");
  const normalized = observations.map(normalizeObservation).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const metric = normalized[0].metric;
  if (normalized.some((observation) => observation.metric !== metric)) throw new TypeError("observations must use one metric");
  const first = normalized[0];
  const latest = normalized.at(-1);
  const absoluteChange = latest.value - first.value;
  return Object.freeze({
    schemaVersion: 1,
    metric,
    observationCount: normalized.length,
    firstOccurredAt: first.occurredAt,
    latestOccurredAt: latest.occurredAt,
    firstValue: first.value,
    latestValue: latest.value,
    absoluteChange,
    relativeChange: first.value === 0 ? null : absoluteChange / Math.abs(first.value)
  });
}
