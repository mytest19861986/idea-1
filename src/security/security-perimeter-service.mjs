import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * SECURITY PERIMETER & RATE LIMITING SERVICE (PROD-READINESS-001 / P0-003)
 * Enforces secure headers, client rate limiting, and secret sanitization.
 * ============================================================================
 */

export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com;",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin"
});

export class SecurityPerimeterService {
  constructor({ maxRequestsPerMinute = 60, clock = () => new Date() } = {}) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.clock = clock;
    this.clientRequests = new Map();
  }

  /**
   * Applies and validates standard production HTTP security headers.
   */
  getSecurityHeaders() {
    return SECURITY_HEADERS;
  }

  /**
   * Checks client IP rate limit window.
   */
  checkRateLimit(clientIp) {
    const now = this.clock().getTime();
    const windowMs = 60 * 1000;

    let timestamps = this.clientRequests.get(clientIp) || [];
    timestamps = timestamps.filter(t => (now - t) < windowMs);

    if (timestamps.length >= this.maxRequestsPerMinute) {
      return { ok: false, status: 429, error: "RATE_LIMITED: Exceeded 60 requests per minute." };
    }

    timestamps.push(now);
    this.clientRequests.set(clientIp, timestamps);

    return {
      ok: true,
      remaining: this.maxRequestsPerMinute - timestamps.length
    };
  }

  /**
   * Sanitizes error messages to prevent database credential or secret leaks.
   */
  sanitizeErrorOutput(errorObj) {
    const raw = errorObj?.message || String(errorObj || "");
    const sanitized = raw
      .replace(/postgres:\/\/[^@]+@/g, "postgres://[REDACTED_AUTH]@")
      .replace(/password=[^\s;]+/gi, "password=[REDACTED]")
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");

    return deepFreeze({
      error: sanitized,
      safeForClient: true
    });
  }
}
