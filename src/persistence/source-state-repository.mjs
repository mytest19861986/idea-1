import { deepFreeze, validateIsoTimestamp } from "../discovery/discovery-intake.mjs";
import { canTransition, SourceStatus } from "../source-registry/lifecycle.mjs";
import { telemetry } from "../observability/telemetry.mjs";

/**
 * ============================================================================
 * SOURCE STATE REPOSITORY (PKG-STATE-019)
 * Invariants: STATE-I001 through STATE-I010
 * Optimistic revision control, immutable audit trail, atomic governance
 * ============================================================================
 */

export class SourceStateRepository {
  constructor(options = {}) {
    this.sources = new Map(); // sourceId -> { sourceId, status, revision, metadata, ... }
    this.transitions = []; // Array of transition records
  }

  saveSource(source) {
    if (!source || !source.id) {
      throw new TypeError("source with id is required");
    }
    const status = source.status || SourceStatus.DISCOVERED;
    const existing = this.sources.get(source.id);

    if (!existing) {
      const record = {
        sourceId: source.id,
        name: source.name || source.id,
        status,
        revision: 1,
        metadata: source.metadata ? { ...source.metadata } : {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.sources.set(source.id, record);
      return deepFreeze({ ...record });
    }

    return deepFreeze({ ...existing });
  }

  getSource(sourceId) {
    const record = this.sources.get(sourceId);
    return record ? deepFreeze({ ...record }) : null;
  }

  getAllSources() {
    return Array.from(this.sources.values()).map(s => deepFreeze({ ...s }));
  }

  /**
   * Optimistic concurrency state transition (STATE-I001 - STATE-I005)
   */
  transitionSourceState(sourceId, expectedRevision, toStatus, { reason, decisionId = null, actor = "system", occurredAt = new Date().toISOString() } = {}) {
    if (!reason || typeof reason !== "string") {
      throw new TypeError("reason is required for source transition");
    }
    validateIsoTimestamp(occurredAt, "occurredAt");

    const current = this.sources.get(sourceId);
    if (!current) {
      throw new Error(`SOURCE_NOT_FOUND: Source ${sourceId} does not exist`);
    }

    // 1. Optimistic Revision Guard (Lost-Update Protection)
    if (current.revision !== expectedRevision) {
      telemetry.recordCounter("source_state_conflict", 1, { sourceId, expectedRevision, actualRevision: current.revision });
      const err = new Error(`STALE_SOURCE_STATE: Expected revision ${expectedRevision} but found ${current.revision}`);
      err.code = "STALE_SOURCE_STATE";
      err.expectedRevision = expectedRevision;
      err.actualRevision = current.revision;
      throw err;
    }

    // 2. Canonical Lifecycle Transition Gate
    if (!canTransition(current.status, toStatus)) {
      telemetry.recordCounter("source_illegal_transition", 1, { sourceId, from: current.status, to: toStatus });
      const err = new Error(`ILLEGAL_LIFecycle_TRANSITION: Cannot transition from ${current.status} to ${toStatus}`);
      err.code = "ILLEGAL_LIFECYCLE_TRANSITION";
      throw err;
    }

    const fromStatus = current.status;
    const fromRevision = current.revision;
    const toRevision = fromRevision + 1;

    // Mutate source state atomically
    current.status = toStatus;
    current.revision = toRevision;
    current.lastTransitionAt = occurredAt;
    current.lastTransitionReason = reason;
    current.updatedAt = occurredAt;

    // Record immutable audit transition
    const transitionRecord = deepFreeze({
      transitionId: `trn:${sourceId}:${toRevision}:${Date.parse(occurredAt)}`,
      sourceId,
      fromStatus,
      toStatus,
      fromRevision,
      toRevision,
      reason,
      decisionId,
      actor,
      occurredAt
    });
    this.transitions.push(transitionRecord);

    telemetry.recordCounter("source_state_transitioned", 1, {
      fromStatus,
      toStatus
    });

    return deepFreeze({
      success: true,
      source: deepFreeze({ ...current }),
      transition: transitionRecord
    });
  }

  getTransitionAuditLog(sourceId) {
    return this.transitions
      .filter(t => t.sourceId === sourceId)
      .map(t => deepFreeze({ ...t }));
  }
}
