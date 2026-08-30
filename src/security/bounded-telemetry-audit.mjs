import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * BOUNDED TELEMETRY BUFFER & OPERATOR AUDIT LEDGER (PROD-OPS-002-SUPPLEMENT)
 * Enforces:
 * 1. Strict Memory Bounding (Max 1000 items, Drop Oldest on overflow)
 * 2. Network partition buffer resilience (Zero crash on sink failure)
 * 3. Operator Auditability (Tracks actor, IP, timestamp, and mutation type)
 * ============================================================================
 */

export class BoundedTelemetryBuffer {
  constructor({ maxBufferSize = 1000, overflowPolicy = "DROP_OLDEST" } = {}) {
    this.maxBufferSize = maxBufferSize;
    this.overflowPolicy = overflowPolicy;
    this.buffer = [];
    this.droppedAlertCount = 0;
    this.highWaterMark = 0;
    this.overflowEventCount = 0;
    this.sinkFailureCount = 0;
  }

  push(item) {
    if (this.buffer.length >= this.maxBufferSize) {
      this.overflowEventCount++;
      if (this.overflowPolicy === "DROP_OLDEST") {
        this.buffer.shift();
        this.droppedAlertCount++;
      } else {
        this.droppedAlertCount++;
        return { ok: false, dropped: true, reason: "BUFFER_OVERFLOW", droppedCount: this.droppedAlertCount };
      }
    }

    const entry = {
      id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      payload: item
    };

    this.buffer.push(entry);

    // Track high-water mark
    if (this.buffer.length > this.highWaterMark) {
      this.highWaterMark = this.buffer.length;
    }

    return { ok: true, id: entry.id, bufferSize: this.buffer.length, droppedCount: this.droppedAlertCount };
  }

  flush(sinkFn) {
    const itemsToFlush = [...this.buffer];
    try {
      if (sinkFn) {
        sinkFn(itemsToFlush);
      }
      this.buffer = [];
      return { ok: true, flushedCount: itemsToFlush.length, droppedAlerts: this.droppedAlertCount };
    } catch (err) {
      // Retain in buffer up to maxBufferSize on network partition
      this.sinkFailureCount++;
      return { ok: false, error: err.message, retainedCount: this.buffer.length, sinkFailures: this.sinkFailureCount };
    }
  }

  getStats() {
    return {
      currentSize: this.buffer.length,
      maxLimit: this.maxBufferSize,
      overflowPolicy: this.overflowPolicy,
      totalDropped: this.droppedAlertCount,
      highWaterMark: this.highWaterMark,
      overflowEventCount: this.overflowEventCount,
      sinkFailureCount: this.sinkFailureCount,
      overflowEventVisible: this.overflowEventCount > 0,
      alertDestinationFailureVisible: this.sinkFailureCount > 0,
      memoryBounded: true
    };
  }
}

export class OperatorAuditService {
  constructor() {
    this.auditLedger = [];
  }

  recordAction({ actor, action, resource, clientIp, status = "SUCCESS", metadata = {} }) {
    const record = deepFreeze({
      auditId: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: actor || "SYSTEM_ANONYMOUS",
      action,
      resource,
      clientIp: clientIp || "127.0.0.1",
      status,
      metadata
    });

    this.auditLedger.push(record);
    return record;
  }

  queryAuditTrail({ actor, action, limit = 50 } = {}) {
    let res = [...this.auditLedger];
    if (actor) res = res.filter(r => r.actor === actor);
    if (action) res = res.filter(r => r.action === action);
    return res.slice(-limit);
  }
}
