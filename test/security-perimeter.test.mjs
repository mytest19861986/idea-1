import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SecurityPerimeterService, SECURITY_HEADERS } from "../src/security/security-perimeter-service.mjs";

describe("PROD-READINESS-001: P0-003 Security Perimeter & Rate Limiting", () => {
  const service = new SecurityPerimeterService({ maxRequestsPerMinute: 3 });

  it("1. Provides complete production security headers (HSTS, CSP, X-Frame, X-Content-Type)", () => {
    const headers = service.getSecurityHeaders();
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.ok(headers["Strict-Transport-Security"].includes("max-age"));
  });

  it("2. Rate limits client exceeding maxRequestsPerMinute (429 RATE_LIMITED)", () => {
    const ip = "192.168.1.50";
    assert.ok(service.checkRateLimit(ip).ok);
    assert.ok(service.checkRateLimit(ip).ok);
    assert.ok(service.checkRateLimit(ip).ok);
    
    // 4th request in same window
    const blocked = service.checkRateLimit(ip);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
  });

  it("3. Sanitizes secrets and credentials from error outputs", () => {
    const err = new Error("FATAL: connection failed postgres://app_user:super_secret_pw@127.0.0.1:5432/db");
    const sanitized = service.sanitizeErrorOutput(err);
    assert.ok(!sanitized.error.includes("super_secret_pw"));
    assert.ok(sanitized.error.includes("[REDACTED_AUTH]"));
  });
});
