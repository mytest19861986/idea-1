import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OperationsPolicyEngine, PriorityBand, ReasonCode, OPERATIONS_POLICY_VERSION } from "../src/discovery/operations-policy-engine.mjs";

describe("WEB-PRODUCT-006R: Operations Policy Engine & Deterministic Attention Priority", () => {
  const baseTime = new Date("2026-08-30T12:00:00.000Z");
  const deterministicClock = () => baseTime;
  const engine = new OperationsPolicyEngine({ clock: deterministicClock });

  it("1. 100% Non-Overlapping Aging Intervals: Boundary Tests (0d, 6d, 7d, 29d, 30d, 59d, 60d, 100d)", () => {
    const checkAge = (days) => {
      const opp = { opportunityId: "test", title: "Test", regulatoryRisk: 2, buildComplexity: 2, localization: "Global", monetizationSummary: "SaaS" };
      const decision = { state: "WATCH", updated_at: new Date(baseTime.getTime() - days * 86400000).toISOString() };
      return engine.evaluateQueueItem({ opportunity: opp, decision }).ageStatus;
    };

    assert.equal(checkAge(0), "FRESH");
    assert.equal(checkAge(6), "FRESH");
    assert.equal(checkAge(7), "NORMAL");
    assert.equal(checkAge(29), "NORMAL");
    assert.equal(checkAge(30), "AGING");
    assert.equal(checkAge(59), "AGING");
    assert.equal(checkAge(60), "STALE");
    assert.equal(checkAge(100), "STALE");
  });

  it("2. Multi-Factor Evidence Gap: Valid SOURCE_CLAIM does NOT trigger evidence gap solely due to absence of FACT", () => {
    const opp = {
      opportunityId: "opp-valid-claim",
      title: "Strong Claim Opp",
      isConfidential: false,
      regulatoryRisk: 3,
      buildComplexity: 4,
      localization: "US",
      monetizationSummary: "Verified Subscription",
      evidenceRisk: "LOW"
    };
    const decision = {
      state: "INVESTIGATE",
      updated_at: baseTime.toISOString()
    };
    // Contains 3 strong SOURCE_CLAIM items, zero FACT items
    const evidenceLedger = [
      { classification: "SOURCE_CLAIM" },
      { classification: "SOURCE_CLAIM" },
      { classification: "DERIVED_METRIC" }
    ];

    const res = engine.evaluateQueueItem({ opportunity: opp, decision, evidenceLedger });
    // Absence of FACT alone must NOT trigger INVESTIGATE_EVIDENCE_GAP
    assert.equal(res.reasons.some(r => r.code === ReasonCode.INVESTIGATE_EVIDENCE_GAP), false);
    assert.equal(res.priorityBand, PriorityBand.P3_LOW);
  });

  it("3. Multi-Factor Evidence Gap: High Hypothesis Ratio (>=70%) triggers INVESTIGATE_EVIDENCE_GAP correctly", () => {
    const opp = {
      opportunityId: "opp-hypothesis-heavy",
      title: "Speculative Opp",
      isConfidential: false,
      regulatoryRisk: 3,
      buildComplexity: 4,
      localization: "US",
      monetizationSummary: "Subscription",
      evidenceRisk: "HIGH"
    };
    const decision = {
      state: "INVESTIGATE",
      updated_at: baseTime.toISOString()
    };
    const evidenceLedger = [
      { classification: "AI_HYPOTHESIS" },
      { classification: "AI_HYPOTHESIS" },
      { classification: "SOURCE_CLAIM" }
    ];

    const res = engine.evaluateQueueItem({ opportunity: opp, decision, evidenceLedger });
    assert.ok(res.reasons.some(r => r.code === ReasonCode.INVESTIGATE_EVIDENCE_GAP));
    assert.equal(res.priorityBand, PriorityBand.P1_HIGH);
  });
});
