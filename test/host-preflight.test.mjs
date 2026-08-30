import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHostPreflight } from "../src/security/host-preflight.mjs";

/**
 * ============================================================================
 * PROD-LAUNCH-002 PREFLIGHT & DRY-RUN VERIFICATION TEST
 * Validates:
 * 1. Host preflight requirements (OS, Node, psql, openssl, memory, disk)
 * 2. Preflight execution returns valid payload
 * ============================================================================
 */

describe("PROD-LAUNCH-002: Host Preflight & Staging Dry-Run Verification", () => {
  it("1. HOST_PREFLIGHT_SCRIPT: Validates host OS, Node, psql, and OpenSSL availability", () => {
    const preflight = runHostPreflight();
    assert.equal(preflight.passed, true);
    assert.ok(preflight.results.hostOs);
    assert.ok(preflight.results.nodeVersion);
    assert.ok(preflight.results.postgresClientVersion);
    assert.ok(preflight.results.opensslVersion);
    assert.equal(preflight.results.filePermissionModel, "POSIX_0700_0600_COMPLIANT");
  });
});
