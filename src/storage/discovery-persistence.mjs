import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * DISCOVERY CORE PERSISTENCE CONTRACT (PKG-PERSIST-011)
 * Invariants: PERSIST-I001 through PERSIST-I020
 * ============================================================================
 */

/**
 * Interface / Reference Implementation for Discovery Candidate Persistence.
 */
export class InMemoryCandidatePersistence {
  constructor() {
    this.candidates = new Map(); // id -> candidate
    this.canonicalUrlIndex = new Map(); // canonicalUrl -> id
    this.attributions = []; // Array of attribution records
  }

  async saveCandidate(candidate, attribution) {
    if (!candidate || !candidate.id || !candidate.canonicalUrl) {
      throw new TypeError("valid candidate with id and canonicalUrl is required");
    }
    if (!attribution || !attribution.sourceId || !attribution.idempotencyKey) {
      throw new TypeError("valid attribution with sourceId and idempotencyKey is required");
    }

    const existingId = this.canonicalUrlIndex.get(candidate.canonicalUrl);
    if (existingId && existingId !== candidate.id) {
      return deepFreeze({
        ok: false,
        status: "CONFLICT",
        reason: `Canonical URL ${candidate.canonicalUrl} is already registered under id ${existingId}`
      });
    }

    // Existing candidate with same ID
    if (this.candidates.has(candidate.id)) {
      const existing = this.candidates.get(candidate.id);
      // Check if attribution is duplicate
      const attrExists = this.attributions.some(
        (a) =>
          a.candidateId === candidate.id &&
          a.sourceId === attribution.sourceId &&
          a.idempotencyKey === attribution.idempotencyKey
      );

      if (attrExists) {
        return deepFreeze({
          ok: true,
          status: "REPLAYED",
          candidate: existing
        });
      }

      // Append new attribution
      const newAttr = deepFreeze({
        attributionId: `attr:${candidate.id}:${attribution.sourceId}:${attribution.idempotencyKey}`,
        candidateId: candidate.id,
        ...attribution
      });
      this.attributions.push(newAttr);

      return deepFreeze({
        ok: true,
        status: "ATTRIBUTION_APPENDED",
        candidate: existing
      });
    }

    // New candidate insert
    const frozenCandidate = deepFreeze({ ...candidate });
    this.candidates.set(candidate.id, frozenCandidate);
    this.canonicalUrlIndex.set(candidate.canonicalUrl, candidate.id);

    const firstAttr = deepFreeze({
      attributionId: `attr:${candidate.id}:${attribution.sourceId}:${attribution.idempotencyKey}`,
      candidateId: candidate.id,
      ...attribution
    });
    this.attributions.push(firstAttr);

    return deepFreeze({
      ok: true,
      status: "STORED",
      candidate: frozenCandidate
    });
  }

  async findCandidateById(id) {
    return this.candidates.get(id) || null;
  }

  async findCandidateByCanonicalUrl(canonicalUrl) {
    const id = this.canonicalUrlIndex.get(canonicalUrl);
    return id ? this.candidates.get(id) || null : null;
  }

  async getAttributionsForCandidate(candidateId) {
    return Object.freeze(this.attributions.filter((a) => a.candidateId === candidateId));
  }
}

/**
 * Interface / Reference Implementation for Entity Resolution & Cluster Persistence.
 */
export class InMemoryResolutionPersistence {
  constructor() {
    this.decisions = [];
    this.clusters = new Map(); // clusterId -> cluster
    this.clusterMembers = new Map(); // clusterId -> Set(candidateId)
    this.candidateToCluster = new Map(); // candidateId -> clusterId
  }

  async saveResolutionDecision(decision) {
    if (!decision || !decision.decisionId || !decision.pairIdentity) {
      throw new TypeError("valid resolution decision is required");
    }
    const frozen = deepFreeze({ ...decision });
    this.decisions.push(frozen);
    return deepFreeze({ ok: true, status: "STORED", decision: frozen });
  }

  async getResolutionHistory(pairIdentity) {
    return Object.freeze(this.decisions.filter((d) => d.pairIdentity === pairIdentity));
  }

  async saveCluster(cluster) {
    if (!cluster || !cluster.clusterId) {
      throw new TypeError("valid cluster with clusterId is required");
    }
    if (!this.clusters.has(cluster.clusterId)) {
      this.clusters.set(cluster.clusterId, deepFreeze({ ...cluster }));
      this.clusterMembers.set(cluster.clusterId, new Set());
    }
    return deepFreeze({ ok: true, status: "STORED", cluster: this.clusters.get(cluster.clusterId) });
  }

  async addClusterMember(clusterId, candidateId, sourceId, addedAt) {
    validateIsoTimestamp(addedAt, "addedAt");
    if (!this.clusters.has(clusterId)) {
      throw new Error(`Cluster ${clusterId} does not exist`);
    }
    const members = this.clusterMembers.get(clusterId);
    if (members.has(candidateId)) {
      return deepFreeze({ ok: true, status: "REPLAYED" });
    }
    members.add(candidateId);
    this.candidateToCluster.set(candidateId, clusterId);
    return deepFreeze({ ok: true, status: "MEMBER_ADDED" });
  }

  async getClusterByCandidateId(candidateId) {
    const clusterId = this.candidateToCluster.get(candidateId);
    if (!clusterId) return null;
    return this.clusters.get(clusterId) || null;
  }
}

/**
 * Interface / Reference Implementation for Source Observation Persistence.
 */
export class InMemoryObservationPersistence {
  constructor() {
    this.observations = new Map(); // observationId -> observation
    this.sourceObservations = new Map(); // sourceId -> [observationId]
  }

  async saveObservation(observation) {
    if (!observation || !observation.observationId || !observation.sourceId) {
      throw new TypeError("valid observation with observationId and sourceId is required");
    }
    if (this.observations.has(observation.observationId)) {
      return deepFreeze({
        ok: true,
        status: "REPLAYED",
        observation: this.observations.get(observation.observationId)
      });
    }

    const frozen = deepFreeze({ ...observation });
    this.observations.set(observation.observationId, frozen);

    if (!this.sourceObservations.has(observation.sourceId)) {
      this.sourceObservations.set(observation.sourceId, []);
    }
    this.sourceObservations.get(observation.sourceId).push(observation.observationId);

    return deepFreeze({ ok: true, status: "STORED", observation: frozen });
  }

  async getObservationsForSource(sourceId) {
    const ids = this.sourceObservations.get(sourceId) || [];
    return Object.freeze(ids.map((id) => this.observations.get(id)));
  }
}

/**
 * Interface / Reference Implementation for Source Health Snapshot Persistence.
 */
export class InMemoryHealthSnapshotPersistence {
  constructor() {
    this.snapshots = new Map(); // snapshotId -> snapshot
    this.sourceSnapshots = new Map(); // sourceId -> [snapshot]
  }

  async saveSnapshot(snapshot) {
    if (!snapshot || !snapshot.sourceId || !snapshot.evaluatedAt) {
      throw new TypeError("valid health snapshot is required");
    }
    const snapshotId = snapshot.snapshotId || `snap:${snapshot.sourceId}:${Date.parse(snapshot.evaluatedAt)}`;
    const snapshotWithId = deepFreeze({ ...snapshot, snapshotId });

    if (this.snapshots.has(snapshotId)) {
      return deepFreeze({ ok: true, status: "REPLAYED", snapshot: this.snapshots.get(snapshotId) });
    }

    this.snapshots.set(snapshotId, snapshotWithId);

    if (!this.sourceSnapshots.has(snapshot.sourceId)) {
      this.sourceSnapshots.set(snapshot.sourceId, []);
    }
    this.sourceSnapshots.get(snapshot.sourceId).push(snapshotWithId);

    return deepFreeze({ ok: true, status: "STORED", snapshot: snapshotWithId });
  }

  async getSnapshotsForSource(sourceId) {
    const list = this.sourceSnapshots.get(sourceId) || [];
    return Object.freeze([...list]);
  }
}

/**
 * Interface / Reference Implementation for Source Governance Persistence.
 */
export class InMemoryGovernancePersistence {
  constructor() {
    this.decisions = new Map(); // decisionId -> decision
    this.applications = new Map(); // decisionId -> application
  }

  async saveDecision(decision) {
    if (!decision || !decision.decisionId || !decision.sourceId) {
      throw new TypeError("valid governance decision is required");
    }
    if (this.decisions.has(decision.decisionId)) {
      return deepFreeze({ ok: true, status: "REPLAYED", decision: this.decisions.get(decision.decisionId) });
    }
    const frozen = deepFreeze({ ...decision });
    this.decisions.set(decision.decisionId, frozen);
    return deepFreeze({ ok: true, status: "STORED", decision: frozen });
  }

  async getDecisionById(decisionId) {
    return this.decisions.get(decisionId) || null;
  }

  async saveApplication(application) {
    if (!application || !application.decisionId || !application.sourceId) {
      throw new TypeError("valid governance application is required");
    }
    if (!this.decisions.has(application.decisionId)) {
      throw new Error(`Governance decision ${application.decisionId} does not exist`);
    }
    if (this.applications.has(application.decisionId)) {
      return deepFreeze({ ok: true, status: "REPLAYED", application: this.applications.get(application.decisionId) });
    }
    const applicationId = `app:${application.decisionId}`;
    const frozen = deepFreeze({ applicationId, ...application });
    this.applications.set(application.decisionId, frozen);
    return deepFreeze({ ok: true, status: "APPLIED", application: frozen });
  }

  async getApplicationByDecisionId(decisionId) {
    return this.applications.get(decisionId) || null;
  }
}
