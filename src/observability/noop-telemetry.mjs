/**
 * ============================================================================
 * NOOP TELEMETRY ADAPTER (PKG-OBS-013)
 * Invariants: OBS-I015, OBS-I016
 * Safe fallback when telemetry is disabled or unavailable.
 * ============================================================================
 */

export class NoopTelemetryAdapter {
  startSpan(name, attributes = {}) {
    return {
      name,
      attributes,
      end: () => {},
      recordException: () => {},
      setStatus: () => {}
    };
  }

  incrementCounter(name, value = 1, labels = {}) {}

  recordHistogram(name, value, labels = {}) {}

  log(level, eventName, payload = {}) {}

  getSpans() {
    return [];
  }

  getMetrics() {
    return [];
  }

  getLogs() {
    return [];
  }

  clear() {}
}
