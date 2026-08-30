import { deepFreeze } from "./discovery-intake.mjs";

/**
 * ============================================================================
 * PORTFOLIO DECISION STORE & WORKFLOW SERVICE (WEB-PRODUCT-005R2)
 * Manages durable manager decisions (SHORTLIST, WATCH, INVESTIGATE, HOLD),
 * optimistic concurrency revision control, input bounds enforcement,
 * and append-only decision audit events.
 * Strictly decoupled from SourceStatus, Candidate Identity, and Evidence State.
 * ============================================================================
 */

export const PortfolioState = Object.freeze({
  WATCH: "WATCH",
  INVESTIGATE: "INVESTIGATE",
  SHORTLIST: "SHORTLIST",
  HOLD: "HOLD"
});

export const BOUNDS = Object.freeze({
  NOTE_LENGTH_MAX: 4000,
  TAG_COUNT_MAX: 20,
  TAG_LENGTH_MAX: 64,
  REASON_LENGTH_MAX: 1000
});

export class PostgresPortfolioDecisionStore {
  constructor(pgClient) {
    this.client = pgClient;
  }

  /**
   * Saves or updates a manager portfolio decision with optimistic concurrency control
   * and strict payload bound validation.
   */
  async setDecision({
    opportunityId,
    state,
    decisionReason = null,
    priority = "MEDIUM",
    tags = [],
    expectedRevision = null,
    actor = "product-manager",
    occurredAt = new Date().toISOString()
  }) {
    if (!Object.values(PortfolioState).includes(state)) {
      throw new Error(`INVALID_PORTFOLIO_STATE: ${state} is not a valid canonical portfolio state.`);
    }
    if (!opportunityId || typeof opportunityId !== "string") {
      throw new Error("INVALID_OPPORTUNITY_ID: opportunityId is strictly required.");
    }

    // Strict input bounds enforcement
    if (decisionReason && decisionReason.length > BOUNDS.REASON_LENGTH_MAX) {
      throw new Error(`OVERSIZED_REASON: Reason exceeds maximum limit of ${BOUNDS.REASON_LENGTH_MAX} characters.`);
    }
    if (tags && Array.isArray(tags)) {
      if (tags.length > BOUNDS.TAG_COUNT_MAX) {
        throw new Error(`OVERSIZED_TAG_COLLECTION: Tag count exceeds maximum limit of ${BOUNDS.TAG_COUNT_MAX}.`);
      }
      for (const t of tags) {
        if (typeof t === "string" && t.length > BOUNDS.TAG_LENGTH_MAX) {
          throw new Error(`OVERSIZED_TAG: Tag '${t.slice(0, 10)}...' exceeds limit of ${BOUNDS.TAG_LENGTH_MAX} characters.`);
        }
      }
    }

    // Check existing decision
    const checkSql = `SELECT decision_id, state, revision FROM portfolio_decisions WHERE opportunity_id = $1;`;
    const checkRes = await this.client.query(checkSql, [opportunityId]);

    if (checkRes.rows.length === 0) {
      // Initial creation
      const decisionId = `dec:${opportunityId}`;
      const eventId = `ev:dec:${opportunityId}:rev1:${Date.now()}`;

      const insertSql = `
        INSERT INTO portfolio_decisions (
          decision_id, opportunity_id, state, decision_reason, priority, tags, revision, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
        RETURNING *;
      `;
      const res = await this.client.query(insertSql, [
        decisionId, opportunityId, state, decisionReason, priority, JSON.stringify(tags), occurredAt, occurredAt
      ]);

      const eventSql = `
        INSERT INTO portfolio_decision_events (
          event_id, decision_id, opportunity_id, from_state, to_state, occurred_at, actor, reason
        ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7);
      `;
      await this.client.query(eventSql, [
        eventId, decisionId, opportunityId, state, occurredAt, actor, decisionReason
      ]);

      return deepFreeze({
        ok: true,
        decision: res.rows[0],
        status: "CREATED"
      });
    }

    // Existing decision update with Optimistic Concurrency Protection
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
    const eventId = `ev:${current.decision_id}:rev${nextRevision}:${Date.now()}`;

    const updateSql = `
      UPDATE portfolio_decisions
      SET state = $1, decision_reason = $2, priority = $3, tags = $4, revision = $5, updated_at = $6
      WHERE decision_id = $7
      RETURNING *;
    `;
    const updateRes = await this.client.query(updateSql, [
      state, decisionReason, priority, JSON.stringify(tags), nextRevision, occurredAt, current.decision_id
    ]);

    const eventSql = `
      INSERT INTO portfolio_decision_events (
        event_id, decision_id, opportunity_id, from_state, to_state, occurred_at, actor, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `;
    await this.client.query(eventSql, [
      eventId, current.decision_id, opportunityId, current.state, state, occurredAt, actor, decisionReason
    ]);

    return deepFreeze({
      ok: true,
      decision: updateRes.rows[0],
      status: "UPDATED"
    });
  }

  /**
   * Retrieves decision and its append-only audit trail.
   */
  async getDecision(opportunityId) {
    const sql = `SELECT * FROM portfolio_decisions WHERE opportunity_id = $1;`;
    const res = await this.client.query(sql, [opportunityId]);
    if (res.rows.length === 0) return null;

    const decision = res.rows[0];
    const eventSql = `
      SELECT * FROM portfolio_decision_events 
      WHERE decision_id = $1 
      ORDER BY occurred_at ASC;
    `;
    const eventsRes = await this.client.query(eventSql, [decision.decision_id]);

    return deepFreeze({
      ...decision,
      history: eventsRes.rows
    });
  }

  /**
   * Lists all opportunities by portfolio state (e.g. all SHORTLIST candidates).
   */
  async listByState(state) {
    const sql = `
      SELECT p.*, c.title, c.canonical_url, c.confidence, c.metadata
      FROM portfolio_decisions p
      JOIN discovery_candidates c ON p.opportunity_id = c.id
      WHERE p.state = $1
      ORDER BY p.updated_at DESC;
    `;
    const res = await this.client.query(sql, [state]);
    return deepFreeze({
      state,
      count: res.rows.length,
      items: res.rows
    });
  }
}
