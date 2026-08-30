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
  sourceReliability = null,
  sourceDiversity = null,
  corroborationScore = null,
  recencyScore = null,
  directnessScore = null,
  contradictionLevel = 0,
  dataCompleteness = null,
  claimSpecificity = null,
  confidenceVersion = "v1.0.0"
} = {}) {
  const factors = [
    { val: sourceReliability, weight: 0.20 },
    { val: sourceDiversity, weight: 0.15 },
    { val: corroborationScore, weight: 0.20 },
    { val: recencyScore, weight: 0.15 },
    { val: directnessScore, weight: 0.10 },
    { val: dataCompleteness, weight: 0.10 },
    { val: claimSpecificity, weight: 0.10 }
  ];

  // If all positive factors are null/absent, confidence is strictly UNKNOWN (null)
  const presentFactors = factors.filter(f => typeof f.val === "number" && !Number.isNaN(f.val));
  if (presentFactors.length === 0) {
    return deepFreeze({
      confidenceVersion,
      finalConfidence: null,
      breakdown: {
        sourceReliability: null,
        sourceDiversity: null,
        corroborationScore: null,
        recencyScore: null,
        directnessScore: null,
        contradictionLevel: typeof contradictionLevel === "number" ? Math.max(0, Math.min(100, contradictionLevel)) : 0,
        dataCompleteness: null,
        claimSpecificity: null
      },
      status: "UNKNOWN_CONFIDENCE",
      calculatedAt: new Date().toISOString()
    });
  }

  // Validate bounds [0, 100] for all present factors
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  const basePositive = (
    ((sourceReliability !== null ? clamp(sourceReliability) : 0) * 0.20) +
    ((sourceDiversity !== null ? clamp(sourceDiversity) : 0) * 0.15) +
    ((corroborationScore !== null ? clamp(corroborationScore) : 0) * 0.20) +
    ((recencyScore !== null ? clamp(recencyScore) : 0) * 0.15) +
    ((directnessScore !== null ? clamp(directnessScore) : 0) * 0.10) +
    ((dataCompleteness !== null ? clamp(dataCompleteness) : 0) * 0.10) +
    ((claimSpecificity !== null ? clamp(claimSpecificity) : 0) * 0.10)
  );

  const penalty = (clamp(contradictionLevel) * 0.35);
  const finalConfidence = Math.max(0, Math.min(100, Number((basePositive - penalty).toFixed(2))));

  return deepFreeze({
    confidenceVersion,
    finalConfidence,
    breakdown: {
      sourceReliability: sourceReliability !== null ? clamp(sourceReliability) : null,
      sourceDiversity: sourceDiversity !== null ? clamp(sourceDiversity) : null,
      corroborationScore: corroborationScore !== null ? clamp(corroborationScore) : null,
      recencyScore: recencyScore !== null ? clamp(recencyScore) : null,
      directnessScore: directnessScore !== null ? clamp(directnessScore) : null,
      contradictionLevel: clamp(contradictionLevel),
      dataCompleteness: dataCompleteness !== null ? clamp(dataCompleteness) : null,
      claimSpecificity: claimSpecificity !== null ? clamp(claimSpecificity) : null
    },
    status: "ASSESSED",
    calculatedAt: new Date().toISOString()
  });
}

/**
 * 5. Opportunity Candidate Lifecycle & Deduplication Engine
 */
export function createOpportunityCandidate({
  opportunityId,
  clusterId = null,
  isConfidential = false,
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
    isConfidential: Boolean(isConfidential),
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

/**
 * 6. Cluster Confidentiality Barrier & Deduplication Filter (B4 Gate)
 * If a cluster contains ANY confidential member, suppresses clusterId and cluster-aggregated
 * handles on public projections across ALL members, preventing sibling existence disclosure.
 */
export function sanitizeClusterProjection(candidateList = [], isPrivileged = false) {
  if (!Array.isArray(candidateList)) throw new TypeError("candidateList must be an array");
  
  // Find all clusterIds that have at least one confidential candidate
  const confidentialClusters = new Set(
    candidateList
      .filter(c => c && c.isConfidential && c.clusterId)
      .map(c => c.clusterId)
  );

  return Object.freeze(candidateList.map(cand => {
    if (!cand) return cand;
    const belongsToConfidentialCluster = cand.clusterId && confidentialClusters.has(cand.clusterId);
    
    // For unprivileged/public viewers: suppress clusterId if confidential or belongs to confidential cluster
    if (!isPrivileged && (cand.isConfidential || belongsToConfidentialCluster)) {
      return Object.freeze({
        ...cand,
        clusterId: null,
        isDeduplicated: false
      });
    }
    return cand;
  }));
}

