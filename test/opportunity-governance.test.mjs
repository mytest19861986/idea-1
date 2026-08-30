import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LocalizationDimension,
  RegulatoryRiskSector,
  EvidenceFreshnessStatus,
  createLocalizationAssessment,
  createRegulatoryRiskAssessment,
  calculateEvidenceFreshness,
  calculateGranularEvidenceConfidence,
  createOpportunityCandidate
} from "../src/analysis/opportunity-governance.mjs";

describe("PRODUCT-EXPANSION-001: Expanded Governance, Localization & Regulatory Invariant Tests", () => {
  it("1. Regulatory Risk Invariant: NO_REGULATORY_EVIDENCE != LOW_RISK (Preserved as UNKNOWN_EXPOSURE)", () => {
    const regAssessment = createRegulatoryRiskAssessment({
      opportunityId: "opp-fintech-01",
      sectorRisks: {
        [RegulatoryRiskSector.FINANCIAL_REGULATION]: {
          level: "HIGH",
          description: "Requires SEC / FINRA Broker-Dealer Registration",
          evidenceIds: ["ev-reg-01"]
        }
      }
    });

    assert.equal(regAssessment.overallRiskPosture, "ELEVATED_RISK");
    assert.equal(regAssessment.unassessedSectors.length, 12);
    assert.ok(regAssessment.unassessedSectors.includes(RegulatoryRiskSector.DATA_PRIVACY));
  });

  it("2. Localization Assessment: Preserves unknown adaptation dimensions without false defaults", () => {
    const loc = createLocalizationAssessment({
      opportunityId: "opp-dach-01",
      targetMarket: "DACH_GERMANY",
      dimensionEvaluations: {
        [LocalizationDimension.LANGUAGE]: { score: 9, notes: "German locale strings localized" },
        [LocalizationDimension.DATA_LOCALIZATION]: { score: 10, notes: "Frankfurt AWS region deployment" }
      }
    });

    assert.equal(loc.targetMarket, "DACH_GERMANY");
    assert.equal(loc.isFullyEvaluated, false);
    assert.equal(loc.unknownDimensions.length, 11);
    assert.ok(loc.unknownDimensions.includes(LocalizationDimension.PAYMENT_INFRASTRUCTURE));
  });

  it("3. Evidence Freshness Decay: Accurately categorizes CURRENT, AGING, STALE and UNKNOWN", () => {
    const now = "2026-08-31T00:00:00.000Z";
    assert.equal(calculateEvidenceFreshness("2026-08-20T00:00:00.000Z", now), EvidenceFreshnessStatus.CURRENT); // 11 days
    assert.equal(calculateEvidenceFreshness("2026-06-15T00:00:00.000Z", now), EvidenceFreshnessStatus.AGING);   // 77 days
    assert.equal(calculateEvidenceFreshness("2026-01-01T00:00:00.000Z", now), EvidenceFreshnessStatus.STALE);   // 242 days
    assert.equal(calculateEvidenceFreshness(null, now), EvidenceFreshnessStatus.UNKNOWN);
  });

  it("4. Granular 8-Factor Confidence Breakdown: Penalizes contradictions and produces reproducible versioned score", () => {
    const confHigh = calculateGranularEvidenceConfidence({
      sourceReliability: 90,
      sourceDiversity: 85,
      corroborationScore: 90,
      recencyScore: 80,
      directnessScore: 85,
      contradictionLevel: 0,
      dataCompleteness: 90,
      claimSpecificity: 85,
      confidenceVersion: "v1.0.0"
    });
    assert.ok(confHigh.finalConfidence >= 80);

    const confWithContradiction = calculateGranularEvidenceConfidence({
      sourceReliability: 90,
      sourceDiversity: 85,
      corroborationScore: 90,
      recencyScore: 80,
      directnessScore: 85,
      contradictionLevel: 70, // Heavy contradiction penalty
      dataCompleteness: 90,
      claimSpecificity: 85,
      confidenceVersion: "v1.0.0"
    });
    assert.ok(confWithContradiction.finalConfidence < confHigh.finalConfidence);
  });

  it("5. Opportunity Candidate Lifecycle: Enforces structured fields and cluster-based deduplication provenance", () => {
    const candidate = createOpportunityCandidate({
      opportunityId: "opp-cand-001",
      clusterId: "cluster-ai-devtools-77",
      problem: "Expensive cloud LLM inference fees",
      targetCustomer: "Mid-market SaaS engineering teams",
      valueProposition: "Self-hosted sovereign LLM integration widget",
      businessModel: "AGPL open-source + commercial license seats",
      supportingEvidenceIds: ["ev-01", "ev-02"],
      unknowns: ["Long-term customer retention rate"]
    });

    assert.equal(candidate.isDeduplicated, true);
    assert.equal(candidate.clusterId, "cluster-ai-devtools-77");
    assert.equal(candidate.lifecycleState, "ACTIVE_CANDIDATE");
  });
});
