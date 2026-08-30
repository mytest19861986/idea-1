import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * OBSERVABILITY & OUT-OF-PROCESS ALERT SINK RUNTIME (PROD-READINESS-002R)
 * Provides:
 * 1. Structured JSON logger with timestamp, trace_id, level, event, sanitized error
 * 2. Real-time metrics counters for queries, errors, alerts
 * 3. Out-of-process alert delivery sink integration (Webhook / External Collector Bridge)
 * ============================================================================
 */

export class RuntimeObservabilityService {
  constructor({ outOfProcessSink = null, clock = () => new Date() } = {}) {
    this.outOfProcessSink = outOfProcessSink;
    this.clock = clock;
    this.logs = [];
    this.metrics = {
      queries_total: 0,
      errors_total: 0,
      alerts_delivered_total: 0
    };
  }

  log(level, event, payload = {}) {
    const entry = {
      timestamp: this.clock().toISOString(),
      level: level.toUpperCase(),
      event,
      payload: this.sanitizePayload(payload)
    };

    this.logs.push(entry);
    if (level.toLowerCase() === "error" || level.toLowerCase() === "fatal") {
      this.metrics.errors_total += 1;
    }
    return deepFreeze(entry);
  }

  sanitizePayload(payload = {}) {
    const raw = JSON.stringify(payload);
    const sanitized = raw
      .replace(/postgres:\/\/[^@]+@/g, "postgres://[REDACTED]@")
      .replace(/password=[^\s",;]+/gi, "password=[REDACTED]")
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
    return JSON.parse(sanitized);
  }

  async emitCriticalAlert(event, details = {}) {
    const alertId = `alert-${this.clock().getTime()}-${Math.random().toString(36).slice(2, 7)}`;
    const alert = {
      alertId,
      severity: "CRITICAL",
      event,
      details: this.sanitizePayload(details),
      dispatchedAt: this.clock().toISOString()
    };

    let deliveredOutOfProcess = false;
    if (this.outOfProcessSink && typeof this.outOfProcessSink.sendAlert === "function") {
      try {
        await this.outOfProcessSink.sendAlert(alert);
        deliveredOutOfProcess = true;
        this.metrics.alerts_delivered_total += 1;
      } catch (err) {
        this.log("error", "ALERT_SINK_FAILURE", { error: err.message });
      }
    }

    return {
      triggered: true,
      deliveredOutOfProcess,
      alert: deepFreeze(alert)
    };
  }
}
