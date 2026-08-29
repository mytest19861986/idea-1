import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTrend } from "../src/analysis/trends.mjs";

test("trend summaries are ordered, metric-specific, and threshold-free", () => {
  const summary = summarizeTrend([{ metric: "weekly_signups", value: 150, occurredAt: "2026-08-15T00:00:00Z" }, { metric: "weekly_signups", value: 100, occurredAt: "2026-08-01T00:00:00Z" }]);
  assert.deepEqual(summary, { schemaVersion: 1, metric: "weekly_signups", observationCount: 2, firstOccurredAt: "2026-08-01T00:00:00.000Z", latestOccurredAt: "2026-08-15T00:00:00.000Z", firstValue: 100, latestValue: 150, absoluteChange: 50, relativeChange: 0.5 });
  assert.throws(() => summarizeTrend([{ metric: "a", value: 1, occurredAt: "2026-08-01T00:00:00Z" }, { metric: "b", value: 2, occurredAt: "2026-08-02T00:00:00Z" }]), /one metric/);
  assert.throws(() => summarizeTrend([{ metric: "a", value: 0, occurredAt: "invalid" }, { metric: "a", value: 1, occurredAt: "2026-08-02T00:00:00Z" }]), /valid timestamp/);
});
