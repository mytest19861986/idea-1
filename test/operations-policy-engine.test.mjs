import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OperationsPolicyEngine, PriorityBand, ReasonCode, OPERATIONS_POLICY_VERSION } from "../src/discovery/operations-policy-engine.mjs";

describe("WEB-PRODUCT-006: Operations Policy Engine & Deterministic Attention Priority", () => {
  const baseTime = new Date("2026-08-30T12:00:00.000Z");
  const deterministicClock = () => baseTime;
  const engine = new OperationsPolicyEngine({ clock: deterministicClock });

  it("1. STALE_WATCH: WATCH item with 45 days inactivity enters P1_HIGH queue with STALE_WATCH reason", () => {
    const opp = {
      opportunityId: "opp-watch-1",
      title: "Aging Watch Opp",
      isConfidential: false,
      regulatoryRisk: 3,
      buildComplexity: 4,
      localization: "DACH",
      monetizationSummary: "Monthly SaaS"
    };
    const decision = {
      state: "WATCH",
      updated_at: new Date("2026-07-16T12:00:00.000Z").toISOString() // 45 days ago
    };

    const res = engine.evaluateQueueItem({ opportunity: opp, decision });
    assert.equal(res.priorityBand, PriorityBand.P1_HIGH);
    assert.equal(res.ageStatus, "AGING");
    assert.ok(res.reasons.some(r => r.code === ReasonCode.STALE_WATCH));
    assert.equal(res.policyVersion, OPERATIONS_POLICY_VERSION);
  });

  it("2. INVESTIGATE + Evidence Gap: enters P1_HIGH queue with INVESTIGATE_EVIDENCE_GAP reason", () => {
    const opp = {
      opportunityId: "opp-inv-1",
      title: "Investigation Candidate",
      isConfidential: false,
      regulatoryRisk: 4,
      buildComplexity: 4,
      localization: "US",
      monetizationSummary: "Usage tiers"
    };
    const decision = {
      state: "INVESTIGATE",
      updated_at: baseTime.toISOString()
    };
    const evidenceLedger = [
      { classification: "SOURCE_CLAIM" },
      { classification: "AI_HYPOTHESIS" }
    ];

    const res = engine.evaluateQueueItem({ opportunity: opp, decision, evidenceLedger });
    assert.equal(res.priorityBand, PriorityBand.P1_HIGH);
    assert.ok(res.reasons.some(r => r.code === ReasonCode.INVESTIGATE_EVIDENCE_GAP));
  });

  it("3. SHORTLIST + Elevated Risk: enters P0_CRITICAL queue with SHORTLIST_HIGH_RISK reason", () => {
    const opp = {
      opportunityId: "opp-shortlist-1",
      title: "High Risk Shortlist",
      isConfidential: true,
      regulatoryRisk: 8, // High regulatory risk
      buildComplexity: 5,
      localization: "Global",
      monetizationSummary: "Enterprise license"
    };
    const decision = {
      state: "SHORTLIST",
      updated_at: baseTime.toISOString()
    };

    const res = engine.evaluateQueueItem({ opportunity: opp, decision });
    assert.equal(res.priorityBand, PriorityBand.P0_CRITICAL);
    assert.ok(res.reasons.some(r => r.code === ReasonCode.SHORTLIST_HIGH_RISK));
    assert.equal(res.isConfidential, true);
  });
});
