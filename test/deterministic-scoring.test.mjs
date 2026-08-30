import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDeterministicOpportunityScore,
  SCORING_MODEL_VERSIONS
} from "../src/analysis/deterministic-scoring.mjs";

describe("PRODUCT-EXPANSION-001: Golden Deterministic Scoring & Versioning Tests", () => {
  const baseOpportunity = {
    opportunityId: "opp-fintech-001",
    demandStrength: 85,
    tractionVelocity: 90,
    marketDefensibility: 70,
    executionFeasibility: 80,
    evidenceRecords: [
      { url: "https://stripe.com/stats", sourceId: "stripe-official", confidence: 95 },
      { url: "https://bloomberg.com/article", sourceId: "bloomberg", confidence: 85 }
    ]
  };

  it("1. 100% Mathematical Determinism: Identical inputs produce identical score to 4 decimal precision", () => {
    const run1 = calculateDeterministicOpportunityScore(baseOpportunity);
    const run2 = calculateDeterministicOpportunityScore(baseOpportunity);
    assert.equal(run1.opportunityScore, run2.opportunityScore);
    assert.equal(run1.evidenceConfidence, run2.evidenceConfidence);
    assert.equal(run1.opportunityScore, 81.5);
  });

  it("2. Independence from Natural Language: AI prose variance does NOT alter mathematical score", () => {
    const oppWithAIText1 = { ...baseOpportunity, aiGeneratedSummary: "Extremely lucrative enterprise market with massive expansion potential." };
    const oppWithAIText2 = { ...baseOpportunity, aiGeneratedSummary: "Moderate niche B2B segment with steady growth vectors." };

    const score1 = calculateDeterministicOpportunityScore(oppWithAIText1);
    const score2 = calculateDeterministicOpportunityScore(oppWithAIText2);
    assert.equal(score1.opportunityScore, score2.opportunityScore);
  });

  it("3. Strict UNKNOWN Isolation: Missing factors are tracked in unknownFactors and NOT collapsed to 0", () => {
    const oppWithUnknown = {
      opportunityId: "opp-legal-002",
      demandStrength: 90,
      tractionVelocity: null, // UNKNOWN
      marketDefensibility: 80,
      executionFeasibility: null // UNKNOWN
    };

    const res = calculateDeterministicOpportunityScore(oppWithUnknown);
    assert.deepEqual([...res.unknownFactors], ["tractionVelocity", "executionFeasibility"]);
    assert.equal(res.isCompleteEvaluation, false);
    // Calculated over demand (30) + marketDefensibility (25) = (90*30 + 80*25)/55 = 4700/55 = 85.45
    assert.equal(res.opportunityScore, 85.45);
  });

  it("4. Model Versioning Traceability: Switching scoring model versions produces reproducible distinct results", () => {
    const v1Res = calculateDeterministicOpportunityScore({
      ...baseOpportunity,
      scoringVersion: SCORING_MODEL_VERSIONS.V1_BALANCED
    });

    const v2Res = calculateDeterministicOpportunityScore({
      ...baseOpportunity,
      scoringVersion: SCORING_MODEL_VERSIONS.V2_TRACTION_HEAVY
    });

    assert.equal(v1Res.scoringModelVersion, "v1.0.0-balanced");
    assert.equal(v2Res.scoringModelVersion, "v2.0.0-traction-heavy");
    assert.notEqual(v1Res.opportunityScore, v2Res.opportunityScore);
    assert.equal(v1Res.opportunityScore, 81.5);
    assert.equal(v2Res.opportunityScore, 83.5);
  });

  it("5. Opportunity Score vs Evidence Confidence Separation: High score can exist with low confidence", () => {
    const highPotentialUnverified = {
      opportunityId: "opp-crypto-ai-003",
      demandStrength: 95,
      tractionVelocity: 90,
      marketDefensibility: 85,
      executionFeasibility: 80,
      evidenceRecords: [
        { url: "https://unverified-tweet.com/post", sourceId: "anon", confidence: 20 }
      ]
    };

    const res = calculateDeterministicOpportunityScore(highPotentialUnverified);
    assert.ok(res.opportunityScore > 85, "Opportunity score is high based on potential factors");
    assert.ok(res.evidenceConfidence <= 25, "Evidence confidence remains independently low");
  });
});
