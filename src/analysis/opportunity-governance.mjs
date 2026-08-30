/**
 * ============================================================================
 * EXPANDED OPPORTUNITY GOVERNANCE & REGULATORY ENGINE (PRODUCT-EXPANSION-001)
 * Formalizes:
 *  1. Localization Assessment (14 local adaptation dimensions)
 *  2. Regulatory Risk Matrix (Strict: NO_REGULATORY_EVIDENCE != LOW_RISK)
 *  3. Opportunity Candidate Lifecycle & Deduplication (Cluster ID, merge provenance)
 *  4. Evidence Freshness Decay (CURRENT, AGING, STALE, UNKNOWN)
 *  5. Granular 8-Factor Evidence Confidence Breakdown
 * ============================================================================
 */

import { deepFreeze } from "../discovery/discovery-intake.mjs";

export const LocalizationDimension = Object.freeze({
  LOCAL_DEMAND: "LOCAL_DEMAND",
  PAYMENT_INFRASTRUCTURE: "PAYMENT_INFRASTRUCTURE",
  CONSUMER_BEHAVIOR: "CONSUMER_BEHAVIOR",
  LANGUAGE: "LANGUAGE",
  CULTURE: "CULTURE",
  DISTRIBUTION: "DISTRIBUTION",
  SUPPLY_CHAIN: "SUPPLY_CHAIN",
  LOCAL_COMPETITION: "LOCAL_COMPETITION",
  REGULATION: "REGULATION",
  LICENSING: "LICENSING",
  DATA_LOCALIZATION: "DATA_LOCALIZATION",
  UNIT_ECONOMICS: "UNIT_ECONOMICS",
  LOCAL_PRICING_POWER: "LOCAL_PRICING_POWER"
});

export const RegulatoryRiskSector = Object.freeze({
  LICENSING: "LICENSING",
  DATA_PRIVACY: "DATA_PRIVACY",
  FINANCIAL_REGULATION: "FINANCIAL_REGULATION",
  CONSUMER_PROTECTION: "CONSUMER_PROTECTION",
  EMPLOYMENT: "EMPLOYMENT",
  TRANSPORTATION: "TRANSPORTATION",
  HEALTH: "HEALTH",
  EDUCATION: "EDUCATION",
  IMPORT_EXPORT: "IMPORT_EXPORT",
  SANCTIONS: "SANCTIONS",
  TAX: "TAX",
  CONTENT_MODERATION: "CONTENT_MODERATION",
  SECTOR_SPECIFIC: "SECTOR_SPECIFIC"
});

export const EvidenceFreshnessStatus = Object.freeze({
  CURRENT: "CURRENT",     // <= 30 days
  AGING: "AGING",         // 31 - 90 days
  STALE: "STALE",         // > 90 days
  UNKNOWN: "UNKNOWN"      // Missing timestamp
});

function requireString(val, name) {
  if (typeof val !== "string" || !val.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return val.trim();
}

/**
 * 1. Localization Assessment Engine
 */
export function createLocalizationAssessment({
  opportunityId,
  targetMarket,
  dimensionEvaluations = {},
  evidenceIds = []
}) {
  const evaluated = {};
  const unknowns = [];

  for (const dim of Object.values(LocalizationDimension)) {
    const evalData = dimensionEvaluations[dim];
    if (evalData && typeof evalData === "object" && typeof evalData.score === "number") {
      evaluated[dim] = {
        score: evalData.score,
        notes: evalData.notes || "",
        evidenceIds: Array.isArray(evalData.evidenceIds) ? [...evalData.evidenceIds] : []
      };
    } else {
      unknowns.push(dim);
    }
  }

  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    targetMarket: requireString(targetMarket, "targetMarket"),
    isFullyEvaluated: unknowns.length === 0,
    evaluatedDimensions: deepFreeze(evaluated),
    unknownDimensions: deepFreeze(unknowns),
    evidenceIds: deepFreeze([...evidenceIds])
  });
}

/**
 * 2. Regulatory Risk Assessment Engine
 * Critical Invariant: NO_REGULATORY_EVIDENCE != LOW_RISK
 */
export function createRegulatoryRiskAssessment({
  opportunityId,
  sectorRisks = {},
  evidenceIds = []
}) {
  const assessedRisks = {};
  const unassessedSectors = [];

  for (const sector of Object.values(RegulatoryRiskSector)) {
    const risk = sectorRisks[sector];
    if (risk && typeof risk === "object" && risk.level) {
      assessedRisks[sector] = {
        level: risk.level, // LOW, MEDIUM, HIGH, CRITICAL
        description: risk.description || "",
        hasGovernedEvidence: Array.isArray(risk.evidenceIds) && risk.evidenceIds.length > 0,
        evidenceIds: Array.isArray(risk.evidenceIds) ? [...risk.evidenceIds] : []
      };
    } else {
      // Must be classified as UNKNOWN_RISK, never defaulted to LOW
      unassessedSectors.push(sector);
    }
  }

  const hasCriticalOrHigh = Object.values(assessedRisks).some(r => r.level === "HIGH" || r.level === "CRITICAL");

  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    overallRiskPosture: hasCriticalOrHigh ? "ELEVATED_RISK" : (unassessedSectors.length > 0 ? "UNKNOWN_EXPOSURE" : "GOVERNED_BOUNDED"),
    assessedRisks: deepFreeze(assessedRisks),
    unassessedSectors: deepFreeze(unassessedSectors),
    evidenceIds: deepFreeze([...evidenceIds])
  });
}

/**
 * 3. Evidence Freshness Decay Engine
 */
export function calculateEvidenceFreshness(observedAt, nowTimestamp = new Date().toISOString()) {
  if (!observedAt || typeof observedAt !== "string") {
    return EvidenceFreshnessStatus.UNKNOWN;
  }

  const observed = Date.parse(observedAt);
  const now = Date.parse(nowTimestamp);

  if (Number.isNaN(observed) || Number.isNaN(now)) {
    return EvidenceFreshnessStatus.UNKNOWN;
  }

  const diffDays = Math.max(0, (now - observed) / (1000 * 60 * 60 * 24));
  if (diffDays <= 30) return EvidenceFreshnessStatus.CURRENT;
  if (diffDays <= 90) return EvidenceFreshnessStatus.AGING;
  return EvidenceFreshnessStatus.STALE;
}

/**
 * 4. Granular 8-Factor Evidence Confidence Breakdown Engine
 */
export function calculateGranularEvidenceConfidence({
  sourceReliability = 50,      // 0-100
  sourceDiversity = 50,        // 0-100
  corroborationScore = 50,     // 0-100
  recencyScore = 50,           // 0-100
  directnessScore = 50,        // 0-100
  contradictionLevel = 0,      // 0-100 (penalty)
  dataCompleteness = 50,       // 0-100
  claimSpecificity = 50,       // 0-100
  confidenceVersion = "v1.0.0"
}) {
  const basePositive = (
    (sourceReliability * 0.20) +
    (sourceDiversity * 0.15) +
    (corroborationScore * 0.20) +
    (recencyScore * 0.15) +
    (directnessScore * 0.10) +
    (dataCompleteness * 0.10) +
    (claimSpecificity * 0.10)
  );

  const penalty = (contradictionLevel * 0.35);
  const finalConfidence = Math.max(0, Math.min(100, Number((basePositive - penalty).toFixed(2))));

  return deepFreeze({
    confidenceVersion,
    finalConfidence,
    breakdown: {
      sourceReliability,
      sourceDiversity,
      corroborationScore,
      recencyScore,
      directnessScore,
      contradictionLevel,
      dataCompleteness,
      claimSpecificity
    },
    calculatedAt: new Date().toISOString()
  });
}

/**
 * 5. Opportunity Candidate Lifecycle & Deduplication Engine
 */
export function createOpportunityCandidate({
  opportunityId,
  clusterId = null,
  problem,
  targetCustomer,
  valueProposition,
  businessModel,
  supportingEvidenceIds = [],
  contradictoryEvidenceIds = [],
  assumptions = [],
  unknowns = [],
  riskFlags = []
}) {
  return deepFreeze({
    opportunityId: requireString(opportunityId, "opportunityId"),
    clusterId: clusterId ? String(clusterId) : null,
    isDeduplicated: clusterId !== null,
    problem: requireString(problem, "problem"),
    targetCustomer: requireString(targetCustomer, "targetCustomer"),
    valueProposition: requireString(valueProposition, "valueProposition"),
    businessModel: requireString(businessModel, "businessModel"),
    supportingEvidenceIds: deepFreeze([...supportingEvidenceIds]),
    contradictoryEvidenceIds: deepFreeze([...contradictoryEvidenceIds]),
    assumptions: deepFreeze([...assumptions]),
    unknowns: deepFreeze([...unknowns]),
    riskFlags: deepFreeze([...riskFlags]),
    lifecycleState: "ACTIVE_CANDIDATE"
  });
}
