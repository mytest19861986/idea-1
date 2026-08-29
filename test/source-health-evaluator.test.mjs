import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HealthLevel,
  ContributionLevel,
  EvaluationConfidence,
  FailureTaxonomy,
  GovernanceRecommendation,
  EVALUATION_VERSION,
  FORMULA_VERSION,
  evaluateSourceHealth
} from "../src/source-registry/source-health-evaluator.mjs";

test("EVAL-R001: Window validation strictly rejects invalid window intervals", () => {
  assert.throws(
    () => evaluateSourceHealth("src-1", [], {
      windowStart: "2026-08-30T01:00:00Z",
      windowEnd: "2026-08-30T00:00:00Z", // start >= end
      evaluatedAt: "2026-08-30T02:00:00Z"
    }),
    /must be strictly earlier than windowEnd/
  );

  assert.throws(
    () => evaluateSourceHealth("src-1", [], {
      windowStart: "invalid",
      windowEnd: "2026-08-30T01:00:00Z",
      evaluatedAt: "2026-08-30T02:00:00Z"
    }),
    /windowStart must be a valid ISO 8601 timestamp/
  );
});

test("EVAL-R002: Zero observations in window yields UNKNOWN operationalHealth, UNKNOWN contribution, and NONE confidence", () => {
  const snapshot = evaluateSourceHealth("src-1", [], {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(snapshot.operationalHealth, HealthLevel.UNKNOWN);
  assert.strictEqual(snapshot.intelligenceContribution, ContributionLevel.UNKNOWN);
  assert.strictEqual(snapshot.confidence, EvaluationConfidence.NONE);
  assert.strictEqual(snapshot.observationCount, 0);
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.NO_CHANGE);
  assert.strictEqual(snapshot.evaluationVersion, EVALUATION_VERSION);
  assert.strictEqual(snapshot.formulaVersion, FORMULA_VERSION);
});

test("EVAL-R005 & EVAL-R006: Sample sufficiency awareness (1 obs -> LOW confidence, 25 obs -> HIGH confidence)", () => {
  // 1 Observation
  const obs1 = [{ sourceId: "src-1", success: true, yieldCount: 1, occurredAt: "2026-08-30T00:30:00Z" }];
  const snap1 = evaluateSourceHealth("src-1", obs1, {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(snap1.operationalHealth, HealthLevel.HIGH);
  assert.strictEqual(snap1.confidence, EvaluationConfidence.LOW, "1 observation must remain LOW confidence");

  // 25 Observations
  const obs25 = Array.from({ length: 25 }, (_, i) => ({
    sourceId: "src-1",
    success: true,
    yieldCount: 2,
    uniqueCount: 2,
    occurredAt: `2026-08-30T00:${String(i).padStart(2, "0")}:00Z`
  }));

  const snap25 = evaluateSourceHealth("src-1", obs25, {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(snap25.operationalHealth, HealthLevel.HIGH);
  assert.strictEqual(snap25.intelligenceContribution, ContributionLevel.HIGH);
  assert.strictEqual(snap25.confidence, EvaluationConfidence.HIGH, ">= 20 observations yields HIGH confidence");
});

test("EVAL-R001: Filters outside-window observations deterministically", () => {
  const observations = [
    { sourceId: "src-1", success: true, yieldCount: 5, occurredAt: "2026-08-29T23:59:59Z" }, // Before window
    { sourceId: "src-1", success: true, yieldCount: 2, occurredAt: "2026-08-30T00:15:00Z" }, // Inside window
    { sourceId: "src-1", success: true, yieldCount: 3, occurredAt: "2026-08-30T00:45:00Z" }, // Inside window
    { sourceId: "src-1", success: false, yieldCount: 0, occurredAt: "2026-08-30T01:00:01Z" }  // After window
  ];

  const snapshot = evaluateSourceHealth("src-1", observations, {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(snapshot.observationCount, 2);
  assert.strictEqual(snapshot.dimensions.totalYield, 5);
  assert.strictEqual(snapshot.dimensions.failureCount, 0);
});

test("EVAL-R007: Failure taxonomy accurately distinguishes 401, 429, 500, and policy blocks", () => {
  const observations = [
    { sourceId: "src-tax", success: false, statusCode: 401, occurredAt: "2026-08-30T00:10:00Z" },
    { sourceId: "src-tax", success: false, statusCode: 429, occurredAt: "2026-08-30T00:20:00Z" },
    { sourceId: "src-tax", success: false, statusCode: 502, occurredAt: "2026-08-30T00:30:00Z" },
    { sourceId: "src-tax", success: false, failureReason: "POLICY_BLOCKED", occurredAt: "2026-08-30T00:40:00Z" }
  ];

  const snapshot = evaluateSourceHealth("src-tax", observations, {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  const counts = snapshot.dimensions.failureTaxonomyCounts;
  assert.strictEqual(counts.ACCESS_CONFIGURATION_FAILURE, 1);
  assert.strictEqual(counts.RATE_LIMIT_PRESSURE, 1);
  assert.strictEqual(counts.TECHNICAL_FAILURE, 1);
  assert.strictEqual(counts.POLICY_ACCESS_FAILURE, 1);
  assert.strictEqual(snapshot.operationalHealth, HealthLevel.CRITICAL);
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.PAUSE_RECOMMENDED);
});

test("EVAL-R003 & EVAL-R004: Separate Operational Health and Intelligence Contribution (100% transport + 95% dup -> HIGH health, LOW contribution)", () => {
  const observations = Array.from({ length: 10 }, (_, i) => ({
    sourceId: "src-dup",
    success: true,
    yieldCount: 10,
    duplicateCount: 9, // 90% duplicate rate
    uniqueCount: 1,
    occurredAt: `2026-08-30T00:${String(i * 5).padStart(2, "0")}:00Z`
  }));

  const snapshot = evaluateSourceHealth("src-dup", observations, {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  });

  assert.strictEqual(snapshot.operationalHealth, HealthLevel.HIGH, "Transport is 100% reliable -> HIGH");
  assert.strictEqual(snapshot.intelligenceContribution, ContributionLevel.LOW, "90% duplicate rate -> LOW");
  assert.strictEqual(snapshot.governanceRecommendation, GovernanceRecommendation.DOWNRANK);
});

test("EVAL-R009 & EVAL-R010: Order independence and deterministic replay", () => {
  const obsA = [
    { sourceId: "src-det", success: true, yieldCount: 5, uniqueCount: 5, occurredAt: "2026-08-30T00:10:00Z" },
    { sourceId: "src-det", success: false, statusCode: 500, occurredAt: "2026-08-30T00:20:00Z" },
    { sourceId: "src-det", success: true, yieldCount: 2, uniqueCount: 2, occurredAt: "2026-08-30T00:30:00Z" }
  ];

  const obsB = [obsA[2], obsA[0], obsA[1]]; // Shuffled

  const opts = {
    windowStart: "2026-08-30T00:00:00Z",
    windowEnd: "2026-08-30T01:00:00Z",
    evaluatedAt: "2026-08-30T02:00:00Z"
  };

  const snapA = evaluateSourceHealth("src-det", obsA, opts);
  const snapB = evaluateSourceHealth("src-det", obsB, opts);

  assert.deepStrictEqual(snapA, snapB, "Shuffled observation input must produce identical snapshot");

  // Replay
  const snapReplay = evaluateSourceHealth("src-det", obsA, opts);
  assert.deepStrictEqual(snapA, snapReplay, "Replay must be 100% deterministic");
});
