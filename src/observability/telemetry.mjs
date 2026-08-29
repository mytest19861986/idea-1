import { deepFreeze } from "../discovery/discovery-intake.mjs";
import { NoopTelemetryAdapter } from "./noop-telemetry.mjs";

/**
 * ============================================================================
 * OBSERVABILITY & TELEMETRY FACADE (PKG-OBS-013)
 * Invariants: OBS-I001 through OBS-I020
 * Telemetry Schema Version: discovery-observability-v1
 * ============================================================================
 */

export const OBSERVABILITY_VERSION = "discovery-observability-v1";

const FORBIDDEN_METRIC_LABEL_KEYS = new Set([
  "executionid",
  "candidateid",
  "observationid",
  "decisionid",
  "canonicalurl",
  "url",
  "contentreference",
  "rawdocumentid"
]);

const SENSITIVE_KEY_PATTERN = /^(authorization|bearer|password|secret|token|apikey|api_key|cookie|credentials)$/i;

export function redactSensitiveData(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    // Redact password in DB URL
    let redacted = val.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, "$1***$3");
    // Redact Bearer tokens in headers
    redacted = redacted.replace(/(Bearer\s+)[A-Za-z0-9_\-\.+=]+/gi, "$1***");
    return redacted;
  }
  if (Array.isArray(val)) {
    return val.map((item) => redactSensitiveData(item));
  }
  if (typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        res[k] = "[REDACTED]";
      } else if (k === "is_confidential" && v === true) {
        res[k] = true;
      } else {
        res[k] = redactSensitiveData(v);
      }
    }
    return res;
  }
  return val;
}

export function sanitizeMetricLabels(labels = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(labels)) {
    const lowerKey = k.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!FORBIDDEN_METRIC_LABEL_KEYS.has(lowerKey)) {
      safe[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }
  return safe;
}

export class TelemetryFacade {
  constructor(adapter = new NoopTelemetryAdapter()) {
    this.adapter = adapter || new NoopTelemetryAdapter();
  }

  setAdapter(adapter) {
    this.adapter = adapter || new NoopTelemetryAdapter();
  }

  startSpan(name, attributes = {}) {
    try {
      const sanitizedAttrs = redactSensitiveData(attributes);
      const span = this.adapter.startSpan(name, {
        ...sanitizedAttrs,
        "telemetry.version": OBSERVABILITY_VERSION
      });
      return {
        end: () => {
          try {
            if (span && typeof span.end === "function") span.end();
          } catch (_) {}
        },
        recordException: (err) => {
          try {
            if (span && typeof span.recordException === "function") {
              span.recordException(err);
            }
          } catch (_) {}
        },
        setStatus: (status, description) => {
          try {
            if (span && typeof span.setStatus === "function") {
              span.setStatus(status, description);
            }
          } catch (_) {}
        }
      };
    } catch (_) {
      // Telemetry Failure Isolation (OBS-I017)
      return { end: () => {}, recordException: () => {}, setStatus: () => {} };
    }
  }

  recordCounter(name, value = 1, labels = {}) {
    try {
      const safeLabels = sanitizeMetricLabels(labels);
      this.adapter.incrementCounter(name, value, {
        ...safeLabels,
        "telemetry.version": OBSERVABILITY_VERSION
      });
    } catch (_) {
      // Telemetry Failure Isolation (OBS-I017)
    }
  }

  recordHistogram(name, value, labels = {}) {
    try {
      const safeLabels = sanitizeMetricLabels(labels);
      this.adapter.recordHistogram(name, value, {
        ...safeLabels,
        "telemetry.version": OBSERVABILITY_VERSION
      });
    } catch (_) {
      // Telemetry Failure Isolation (OBS-I017)
    }
  }

  log(level, eventName, payload = {}) {
    try {
      const sanitized = redactSensitiveData(payload);
      this.adapter.log(level, eventName, {
        ...sanitized,
        "telemetry.version": OBSERVABILITY_VERSION,
        loggedAt: new Date().toISOString()
      });
    } catch (_) {
      // Telemetry Failure Isolation (OBS-I017)
    }
  }
}

export const telemetry = new TelemetryFacade();
