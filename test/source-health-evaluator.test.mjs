import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HealthStatus,
  GovernanceRecommendation,
  EVALUATOR_VERSION,
  evaluateSourceHealth
} from "../src/source-registry/source-health-evaluator.mjs";

test("evaluateSourceHealth enforces mandatory ISO timestamp 'evaluatedAt' and valid inputs", () => {
  const obs = [{ sourceId: "src-1", success: true, occurredAt: "2026-08-30T00:00:00Z" }];

  assert.throws(() => evaluateSourceHealth("src-1", obs), /evaluatedAt must be a non-empty string/);
  assert.throws(() => evaluateSourceHealth("src-1", obs, { evaluatedAt: "invalid" }), /evaluatedAt must be a valid ISO 8601 timestamp/);
  assert.throws(() => evaluateSourceHealth("", obs, { evaluatedAt: "2026-08-30T01:00:00Z" }), /sourceId is required/);
  assert.throws(() => evaluateSourceHealth("src-1", [], { evaluatedAt: "2026-08-30T01:00:00Z" }), /non-empty array/);
});

test("evaluateSourceHealth evaluates HEALTHY source with MAINTAIN_ACTIVE recommendation", () => {
  const observations = [
    { sourceId: "src-active", success: true, yieldCount: 5, statusCode: 200, occurredAt: "2026-08-30T00:00:00Z" },
    { sourceId: "src-active", success: true, yieldCount: 3, statusCode: 200, occurredAt: "2026-08-30T00:10:00Z" },
    { sourceId: "src-active", success: true, yieldCount: 4, statusCode: 200, occurredAt: "2026-08-30T00:15:00Z" },
    { sourceId: "src-active", success: true, yieldCount: 2, statusCode: 200, occurredAt: "2026-08-30T00:20:00Z" },
    { sourceId: "src-active", success: false, yieldCount: 0, statusCode: 500, occurredAt: "2026-08-30T00:25:00Z" }
  ];

  const snapshot = evaluateSourceHealth("src-active", observations, {
    evaluatedAt: "2026-08-30T01:00:00Z",
    degradedFailureRateThreshold: 25
  });

  assert.strictEqual(snapshot.evaluatorVersion, EVALUATOR_VERSION);
  assert.strictEqual(snapshot.healthStatus, HealthStatus.HEALTHY);
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.MAINTAIN_ACTIVE);
  assert.strictEqual(snapshot.metrics.totalEvents, 5);
  assert.strictEqual(snapshot.metrics.successCount, 4);
  assert.strictEqual(snapshot.metrics.failureCount, 1);
  assert.strictEqual(snapshot.metrics.failureRate, 20.0);
  assert.strictEqual(snapshot.metrics.totalYield, 14);
  assert.strictEqual(snapshot.metrics.latestOccurredAt, "2026-08-30T00:25:00Z");
});

test("evaluateSourceHealth evaluates DEGRADED source and detects rate-limiting (429)", () => {
  const observations = [
    { sourceId: "src-rate-limited", success: true, yieldCount: 2, statusCode: 200, occurredAt: "2026-08-30T00:00:00Z" },
    { sourceId: "src-rate-limited", success: false, yieldCount: 0, statusCode: 429, occurredAt: "2026-08-30T00:05:00Z" },
    { sourceId: "src-rate-limited", success: false, yieldCount: 0, statusCode: 429, occurredAt: "2026-08-30T00:10:00Z" },
    { sourceId: "src-rate-limited", success: true, yieldCount: 1, statusCode: 200, occurredAt: "2026-08-30T00:15:00Z" }
  ];

  const snapshot = evaluateSourceHealth("src-rate-limited", observations, {
    evaluatedAt: "2026-08-30T01:00:00Z",
    degradedFailureRateThreshold: 25,
    criticalFailureRateThreshold: 75
  });

  assert.strictEqual(snapshot.healthStatus, HealthStatus.DEGRADED);
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.DEGRADE_RECOMMENDED);
  assert.strictEqual(snapshot.metrics.failureRate, 50.0);
  assert.strictEqual(snapshot.findings.some((f) => f.code === "RATE_LIMIT_ENCOUNTERED"), true);
});

test("evaluateSourceHealth evaluates CRITICAL source and recommends PAUSE_RECOMMENDED", () => {
  const observations = [
    { sourceId: "src-broken", success: false, yieldCount: 0, statusCode: 503, occurredAt: "2026-08-30T00:00:00Z" },
    { sourceId: "src-broken", success: false, yieldCount: 0, statusCode: 503, occurredAt: "2026-08-30T00:05:00Z" },
    { sourceId: "src-broken", success: false, yieldCount: 0, statusCode: 503, occurredAt: "2026-08-30T00:10:00Z" },
    { sourceId: "src-broken", success: true, yieldCount: 1, statusCode: 200, occurredAt: "2026-08-30T00:15:00Z" }
  ];

  const snapshot = evaluateSourceHealth("src-broken", observations, {
    evaluatedAt: "2026-08-30T01:00:00Z",
    criticalFailureRateThreshold: 60
  });

  assert.strictEqual(snapshot.healthStatus, HealthStatus.CRITICAL);
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.PAUSE_RECOMMENDED);
  assert.strictEqual(snapshot.metrics.failureRate, 75.0);
  assert.strictEqual(snapshot.findings.some((f) => f.code === "CRITICAL_FAILURE_RATE"), true);
});

test("evaluateSourceHealth is purely read-only and returns deep-frozen snapshot", () => {
  const observations = [{ sourceId: "src-immut", success: true, yieldCount: 1, occurredAt: "2026-08-30T00:00:00Z" }];
  const snapshot = evaluateSourceHealth("src-immut", observations, { evaluatedAt: "2026-08-30T01:00:00Z" });

  assert.throws(() => { snapshot.healthStatus = "MUTATED"; }, /Cannot assign to read only property/);
  assert.throws(() => { snapshot.metrics.failureRate = 999; }, /Cannot assign to read only property/);
});
