import { deepFreeze } from "./discovery-intake.mjs";

/**
 * ============================================================================
 * INVESTIGATION RESOLUTION STORE & CADENCE SERVICE (WEB-PRODUCT-007)
 * Manages durable manager investigation lifecycles (OPEN, ACKNOWLEDGED, RESOLVED),
 * resolution codes, optimistic concurrency protection, and review cadence.
 * Strict Invariant: INVESTIGATION_STATE != PORTFOLIO_STATE
 * ============================================================================
 */

export const InvestigationStatus = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED"
});

export const ResolutionCode = Object.freeze({
  EVIDENCE_COLLECTED: "EVIDENCE_COLLECTED",
  RISK_REVIEWED: "RISK_REVIEWED",
  NO_ACTION_REQUIRED: "NO_ACTION_REQUIRED",
  DECISION_UPDATED: "DECISION_UPDATED",
  DUPLICATE_INVESTIGATION: "DUPLICATE_INVESTIGATION",
  OUTDATED_SIGNAL: "OUTDATED_SIGNAL"
});

export const REVIEW_POLICY_VERSION = "review-policy-v1";

export class PostgresInvestigationResolutionStore {
  constructor(pgClient, { clock = () => new Date() } = {}) {
    this.client = pgClient;
    this.clock = clock;
  }

  /**
   * Creates or updates an investigation record with optimistic concurrency protection.
   */
  async updateInvestigation({
    investigationId,
    opportunityId,
    status,
    reasonCode = "ROUTINE_MONITORING",
    priorityAtCreation = "P2_MEDIUM",
    resolutionCode = null,
    resolutionNote = null,
    expectedRevision = null,
    actor = "product-manager"
  }) {
    if (!Object.values(InvestigationStatus).includes(status)) {
      throw new Error(`INVALID_STATUS: ${status} is not a valid InvestigationStatus.`);
    }
    if (resolutionCode && !Object.values(ResolutionCode).includes(resolutionCode)) {
      throw new Error(`INVALID_RESOLUTION_CODE: ${resolutionCode} is not a valid ResolutionCode.`);
    }

    const now = this.clock().toISOString();

    // Check existing
    const checkSql = `SELECT investigation_id, status, revision FROM investigation_records WHERE investigation_id = $1;`;
    const checkRes = await this.client.query(checkSql, [investigationId]);

    if (checkRes.rows.length === 0) {
      // New creation
      const eventId = `ev:${investigationId}:rev1:${Date.now()}`;
      const insertSql = `
        INSERT INTO investigation_records (
          investigation_id, opportunity_id, reason_code, operations_policy_version,
          priority_at_creation, status, acknowledged_at, resolved_at, resolution_code,
          resolution_note, revision, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $12)
        RETURNING *;
      `;
      const ackAt = status === "ACKNOWLEDGED" ? now : null;
      const resAt = status === "RESOLVED" ? now : null;

      const res = await this.client.query(insertSql, [
        investigationId, opportunityId, reasonCode, "operations-policy-v1",
        priorityAtCreation, status, ackAt, resAt, resolutionCode, resolutionNote, now, now
      ]);

      const eventSql = `
        INSERT INTO investigation_events (
          event_id, investigation_id, opportunity_id, from_status, to_status,
          resolution_code, occurred_at, actor, note
        ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8);
      `;
      await this.client.query(eventSql, [
        eventId, investigationId, opportunityId, status, resolutionCode, now, actor, resolutionNote
      ]);

      return deepFreeze({
        ok: true,
        investigation: res.rows[0],
        status: "CREATED"
      });
    }

    // Existing update with revision concurrency check
    const current = checkRes.rows[0];
    if (expectedRevision !== null && expectedRevision !== undefined) {
      if (parseInt(current.revision, 10) !== parseInt(expectedRevision, 10)) {
        return deepFreeze({
          ok: false,
          status: "CONFLICT",
          currentRevision: current.revision,
          expectedRevision,
          reason: `CONCURRENCY_CONFLICT: Expected revision ${expectedRevision}, but current revision is ${current.revision}.`
        });
      }
    }

    const nextRevision = parseInt(current.revision, 10) + 1;
    const eventId = `ev:${investigationId}:rev${nextRevision}:${Date.now()}`;
    const ackAt = status === "ACKNOWLEDGED" ? now : (current.acknowledged_at || null);
    const resAt = status === "RESOLVED" ? now : null;

    const updateSql = `
      UPDATE investigation_records
      SET status = $1, acknowledged_at = $2, resolved_at = $3, resolution_code = $4,
          resolution_note = $5, revision = $6, updated_at = $7
      WHERE investigation_id = $8
      RETURNING *;
    `;
    const updateRes = await this.client.query(updateSql, [
      status, ackAt, resAt, resolutionCode, resolutionNote, nextRevision, now, investigationId
    ]);

    const eventSql = `
      INSERT INTO investigation_events (
        event_id, investigation_id, opportunity_id, from_status, to_status,
        resolution_code, occurred_at, actor, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;
    await this.client.query(eventSql, [
      eventId, investigationId, opportunityId, current.status, status, resolutionCode, now, actor, resolutionNote
    ]);

    return deepFreeze({
      ok: true,
      investigation: updateRes.rows[0],
      status: "UPDATED"
    });
  }

  /**
   * Retrieves investigation and its audit event history.
   */
  async getInvestigation(investigationId) {
    const sql = `SELECT * FROM investigation_records WHERE investigation_id = $1;`;
    const res = await this.client.query(sql, [investigationId]);
    if (res.rows.length === 0) return null;

    const record = res.rows[0];
    const eventSql = `SELECT * FROM investigation_events WHERE investigation_id = $1 ORDER BY occurred_at ASC;`;
    const eventRes = await this.client.query(eventSql, [investigationId]);

    return deepFreeze({
      ...record,
      history: eventRes.rows
    });
  }

  /**
   * Calculates review cadence status for an opportunity.
   */
  calculateReviewCadence({ lastReviewedAt, portfolioState }) {
    const now = this.clock();
    if (!lastReviewedAt) {
      return deepFreeze({ status: "DUE_FOR_REVIEW", daysSinceReview: null, policyVersion: REVIEW_POLICY_VERSION });
    }

    const lastDate = new Date(lastReviewedAt);
    const days = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));

    // SHORTLIST / INVESTIGATE requires weekly review (7d), WATCH requires bi-weekly (14d)
    const thresholdDays = (portfolioState === "SHORTLIST" || portfolioState === "INVESTIGATE") ? 7 : 14;

    let status = "NOT_DUE";
    if (days >= thresholdDays * 2) {
      status = "OVERDUE";
    } else if (days >= thresholdDays) {
      status = "DUE_FOR_REVIEW";
    }

    return deepFreeze({
      status,
      daysSinceReview: days,
      thresholdDays,
      policyVersion: REVIEW_POLICY_VERSION
    });
  }
}
