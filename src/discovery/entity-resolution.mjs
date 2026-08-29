import { deepFreeze, validateIsoTimestamp } from "./discovery-intake.mjs";

export const ResolutionDecision = Object.freeze({
  UNRESOLVED: "UNRESOLVED",
  POSSIBLE_MATCH: "POSSIBLE_MATCH",
  PROBABLE_MATCH: "PROBABLE_MATCH",
  CONFIRMED_MATCH: "CONFIRMED_MATCH",
  CONFIRMED_DISTINCT: "CONFIRMED_DISTINCT",
  BLOCKED_CONFIDENTIAL: "BLOCKED_CONFIDENTIAL"
});

export const SignalType = Object.freeze({
  STRONG_IDENTIFIER: "STRONG_IDENTIFIER",
  SUPPORTING_SIGNAL: "SUPPORTING_SIGNAL",
  WEAK_SIGNAL: "WEAK_SIGNAL",
  UNSAFE_SIGNAL: "UNSAFE_SIGNAL"
});

export const RULE_VERSION = "entity-resolution-v1";

/**
 * Extracts and normalizes domain from a URL or domain string.
 * @param {string} urlString
 * @returns {string|null} normalized hostname/domain
 */
export function extractNormalizedDomain(urlString) {
  if (!urlString || typeof urlString !== "string") return null;
  const clean = urlString.trim().toLowerCase();
  try {
    const parsed = clean.startsWith("http://") || clean.startsWith("https://")
      ? new URL(clean)
      : new URL(`https://${clean}`);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Normalizes an entity name for comparison.
 * @param {string} name
 * @returns {string}
 */
export function normalizeEntityName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Generates an order-independent pair identity for two candidate IDs.
 * @param {string} candidateAId
 * @param {string} candidateBId
 * @returns {string}
 */
export function computePairIdentity(candidateAId, candidateBId) {
  if (!candidateAId || !candidateBId) {
    throw new TypeError("both candidateAId and candidateBId are required");
  }
  const [first, second] = [candidateAId, candidateBId].sort();
  return `pair:${first}:${second}`;
}

/**
 * Generates a deterministic cluster identity independent of the first source.
 * @param {string} seed
 * @returns {string}
 */
export function computeClusterIdentity(seed) {
  return `entity:cluster:${seed}`;
}

/**
 * Evaluates candidate pair matching signals, contradictions, and resolution decision.
 * Enforces:
 * - DEDUP-I001: Immutable candidate referencing
 * - DEDUP-I002: Deterministic rule-based strong matching
 * - DEDUP-I003: Explicit evidence trail
 * - DEDUP-I004: Material contradiction handling
 * - DEDUP-I005: Confidentiality isolation (BLOCKED_CONFIDENTIAL)
 * - DEDUP-I008: Rule versioning
 *
 * @param {object} candidateA
 * @param {object} candidateB
 * @param {object} options
 * @param {string} options.at - Explicit ISO 8601 timestamp (MANDATORY)
 * @param {string} [options.actor="entity-resolution-engine"]
 * @returns {object} Resolution decision object
 */
export function evaluateCandidatePair(candidateA, candidateB, { at, actor = "entity-resolution-engine" } = {}) {
  validateIsoTimestamp(at, "at");

  if (!candidateA || !candidateB || typeof candidateA !== "object" || typeof candidateB !== "object") {
    throw new TypeError("valid candidateA and candidateB objects are required");
  }

  const idA = candidateA.discoveryId;
  const idB = candidateB.discoveryId;
  const pairId = computePairIdentity(idA, idB);

  // 1. Confidentiality Gate (DEDUP-I005):
  // If one side is confidential and the other is public, block linkage to prevent accidental deanonymization
  if (Boolean(candidateA.is_confidential) !== Boolean(candidateB.is_confidential)) {
    return deepFreeze({
      decisionId: `dec:${pairId}:${RULE_VERSION}`,
      pairId,
      candidateAId: idA,
      candidateBId: idB,
      decision: ResolutionDecision.BLOCKED_CONFIDENTIAL,
      confidence: 0.0,
      signals: [],
      contradictions: ["CROSS_CONFIDENTIALITY_LINKAGE_BLOCKED"],
      ruleVersion: RULE_VERSION,
      actor,
      evaluatedAt: at
    });
  }

  const signals = [];
  const contradictions = [];

  // Extract signals
  const domainA = extractNormalizedDomain(candidateA.contentReference || candidateA.metadata?.domain);
  const domainB = extractNormalizedDomain(candidateB.contentReference || candidateB.metadata?.domain);

  const nameA = normalizeEntityName(candidateA.title);
  const nameB = normalizeEntityName(candidateB.title);

  const stableIdA = candidateA.metadata?.stableExternalId || candidateA.metadata?.githubRepo;
  const stableIdB = candidateB.metadata?.stableExternalId || candidateB.metadata?.githubRepo;

  // Signal 1: Stable External Identifier (STRONG_IDENTIFIER)
  if (stableIdA && stableIdB) {
    if (stableIdA === stableIdB) {
      signals.push({
        type: SignalType.STRONG_IDENTIFIER,
        key: "stable_external_id_match",
        detail: stableIdA
      });
    } else {
      contradictions.push("STABLE_EXTERNAL_ID_MISMATCH");
    }
  }

  // Signal 2: Canonical Domain (STRONG_IDENTIFIER)
  if (domainA && domainB) {
    if (domainA === domainB) {
      signals.push({
        type: SignalType.STRONG_IDENTIFIER,
        key: "exact_canonical_domain_match",
        detail: domainA
      });
    } else {
      contradictions.push("CANONICAL_DOMAIN_MISMATCH");
    }
  }

  // Signal 3: Normalized Entity Name (SUPPORTING_SIGNAL)
  if (nameA && nameB && nameA === nameB) {
    signals.push({
      type: SignalType.SUPPORTING_SIGNAL,
      key: "normalized_name_match",
      detail: nameA
    });
  }

  // Determine Resolution Decision
  let decision = ResolutionDecision.UNRESOLVED;
  let confidence = 0.0;

  const hasStrongMatch = signals.some((s) => s.type === SignalType.STRONG_IDENTIFIER);
  const hasContradiction = contradictions.length > 0;

  if (hasStrongMatch && !hasContradiction) {
    decision = ResolutionDecision.CONFIRMED_MATCH;
    confidence = 1.0;
  } else if (hasStrongMatch && hasContradiction) {
    decision = ResolutionDecision.PROBABLE_MATCH;
    confidence = 0.6;
  } else if (!hasStrongMatch && hasContradiction) {
    decision = ResolutionDecision.CONFIRMED_DISTINCT;
    confidence = 0.9;
  } else if (signals.some((s) => s.type === SignalType.SUPPORTING_SIGNAL)) {
    decision = ResolutionDecision.POSSIBLE_MATCH;
    confidence = 0.4;
  } else {
    decision = ResolutionDecision.UNRESOLVED;
    confidence = 0.0;
  }

  return deepFreeze({
    decisionId: `dec:${pairId}:${RULE_VERSION}`,
    pairId,
    candidateAId: idA,
    candidateBId: idB,
    decision,
    confidence,
    signals,
    contradictions,
    ruleVersion: RULE_VERSION,
    actor,
    evaluatedAt: at
  });
}

/**
 * Cross-Source Entity Cluster Management Engine.
 * Manages deterministic entity clusters and memberships based solely on CONFIRMED_MATCH decisions.
 */
export class EntityResolutionEngine {
  #decisions = new Map(); // pairId -> ResolutionDecision
  #candidateToCluster = new Map(); // candidateId -> clusterId
  #clusters = new Map(); // clusterId -> ClusterRecord
  #auditEvents = [];

  /**
   * Evaluates and records resolution decision for a candidate pair.
   * @param {object} candidateA
   * @param {object} candidateB
   * @param {object} options
   * @param {string} options.at - Explicit ISO 8601 timestamp (MANDATORY)
   * @param {string} [options.actor]
   * @returns {object} Resolution decision
   */
  resolvePair(candidateA, candidateB, { at, actor = "entity-resolution-engine" } = {}) {
    validateIsoTimestamp(at, "at");
    const decision = evaluateCandidatePair(candidateA, candidateB, { at, actor });
    this.#decisions.set(decision.pairId, decision);

    const evalEvent = deepFreeze({
      eventType: "ENTITY_RESOLUTION_EVALUATED",
      pairId: decision.pairId,
      decision: decision.decision,
      actor,
      timestamp: at
    });
    this.#auditEvents.push(evalEvent);

    // Auto-cluster ONLY on CONFIRMED_MATCH
    if (decision.decision === ResolutionDecision.CONFIRMED_MATCH) {
      this.#mergeIntoCluster(candidateA, candidateB, decision, { at, actor });
    }

    return decision;
  }

  /**
   * Merges two confirmed matching candidates into a deterministic cluster.
   * @private
   */
  #mergeIntoCluster(candidateA, candidateB, decision, { at, actor }) {
    const idA = candidateA.discoveryId;
    const idB = candidateB.discoveryId;

    let clusterIdA = this.#candidateToCluster.get(idA);
    let clusterIdB = this.#candidateToCluster.get(idB);

    if (!clusterIdA && !clusterIdB) {
      // Create new deterministic cluster based on domain or canonical seed
      const seed = extractNormalizedDomain(candidateA.contentReference || candidateA.metadata?.domain) ||
                   candidateA.metadata?.stableExternalId ||
                   computePairIdentity(idA, idB);
      const newClusterId = computeClusterIdentity(seed);

      const clusterRecord = {
        clusterId: newClusterId,
        memberIds: [idA, idB],
        sources: Array.from(new Set([candidateA.sourceId, candidateB.sourceId])),
        createdAt: at,
        updatedAt: at
      };

      this.#clusters.set(newClusterId, clusterRecord);
      this.#candidateToCluster.set(idA, newClusterId);
      this.#candidateToCluster.set(idB, newClusterId);

      this.#auditEvents.push(deepFreeze({
        eventType: "ENTITY_CLUSTER_CREATED",
        clusterId: newClusterId,
        members: [idA, idB],
        actor,
        timestamp: at
      }));
    } else if (clusterIdA && !clusterIdB) {
      const cluster = this.#clusters.get(clusterIdA);
      if (!cluster.memberIds.includes(idB)) {
        cluster.memberIds.push(idB);
        if (!cluster.sources.includes(candidateB.sourceId)) cluster.sources.push(candidateB.sourceId);
        cluster.updatedAt = at;
        this.#candidateToCluster.set(idB, clusterIdA);

        this.#auditEvents.push(deepFreeze({
          eventType: "ENTITY_CLUSTER_MEMBER_ATTACHED",
          clusterId: clusterIdA,
          memberId: idB,
          actor,
          timestamp: at
        }));
      }
    } else if (!clusterIdA && clusterIdB) {
      const cluster = this.#clusters.get(clusterIdB);
      if (!cluster.memberIds.includes(idA)) {
        cluster.memberIds.push(idA);
        if (!cluster.sources.includes(candidateA.sourceId)) cluster.sources.push(candidateA.sourceId);
        cluster.updatedAt = at;
        this.#candidateToCluster.set(idA, clusterIdB);

        this.#auditEvents.push(deepFreeze({
          eventType: "ENTITY_CLUSTER_MEMBER_ATTACHED",
          clusterId: clusterIdB,
          memberId: idA,
          actor,
          timestamp: at
        }));
      }
    }
  }

  /**
   * Retrieves resolution decision for a pair by candidate IDs.
   * @param {string} candidateAId
   * @param {string} candidateBId
   * @returns {object|null}
   */
  getDecision(candidateAId, candidateBId) {
    const pairId = computePairIdentity(candidateAId, candidateBId);
    return this.#decisions.get(pairId) ?? null;
  }

  /**
   * Retrieves cluster by candidate discovery ID.
   * @param {string} candidateId
   * @returns {object|null}
   */
  getClusterByCandidateId(candidateId) {
    const clusterId = this.#candidateToCluster.get(candidateId);
    if (!clusterId) return null;
    const cluster = this.#clusters.get(clusterId);
    return cluster ? deepFreeze({ ...cluster, memberIds: [...cluster.memberIds], sources: [...cluster.sources] }) : null;
  }

  /**
   * Retrieves full audit events.
   * @returns {Array<object>}
   */
  getAuditEvents() {
    return deepFreeze([...this.#auditEvents]);
  }
}
