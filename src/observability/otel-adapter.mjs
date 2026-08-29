import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * OPENTELEMETRY-COMPATIBLE TEST & IN-MEMORY ADAPTER (PKG-OBS-013)
 * Invariants: OBS-I001 through OBS-I020
 * ============================================================================
 */

export class InMemoryTelemetryAdapter {
  constructor() {
    this.spans = [];
    this.metrics = [];
    this.logs = [];
  }

  startSpan(name, attributes = {}) {
    const startTime = Date.now();
    const spanRecord = {
      name,
      attributes: { ...attributes },
      status: { code: "UNSET" },
      events: [],
      exceptions: [],
      startTime,
      endTime: null,
      durationMs: null
    };

    return {
      name,
      attributes: spanRecord.attributes,
      end: () => {
        spanRecord.endTime = Date.now();
        spanRecord.durationMs = Math.max(0, spanRecord.endTime - spanRecord.startTime);
        this.spans.push(deepFreeze(spanRecord));
      },
      recordException: (err) => {
        spanRecord.exceptions.push({
          message: err?.message || String(err),
          name: err?.name || "Error",
          time: Date.now()
        });
      },
      setStatus: (code, description = "") => {
        spanRecord.status = { code, description };
      }
    };
  }

  incrementCounter(name, value = 1, labels = {}) {
    this.metrics.push(
      deepFreeze({
        type: "COUNTER",
        name,
        value,
        labels: { ...labels },
        timestamp: new Date().toISOString()
      })
    );
  }

  recordHistogram(name, value, labels = {}) {
    this.metrics.push(
      deepFreeze({
        type: "HISTOGRAM",
        name,
        value,
        labels: { ...labels },
        timestamp: new Date().toISOString()
      })
    );
  }

  log(level, eventName, payload = {}) {
    this.logs.push(
      deepFreeze({
        level,
        eventName,
        payload: { ...payload },
        timestamp: new Date().toISOString()
      })
    );
  }

  getSpans() {
    return Object.freeze([...this.spans]);
  }

  getMetrics() {
    return Object.freeze([...this.metrics]);
  }

  getLogs() {
    return Object.freeze([...this.logs]);
  }

  clear() {
    this.spans = [];
    this.metrics = [];
    this.logs = [];
  }
}
