import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CryptographicAuthService, UserRole, RoutePermission } from "../src/security/auth-boundary-service.mjs";

describe("PROD-READINESS-001R: P0-001 Cryptographic Token Verification & Server RBAC", () => {
  const baseTime = new Date("2026-08-30T12:00:00.000Z");
  const authService = new CryptographicAuthService({ clock: () => baseTime });

  it("1. Signs valid token and verifies claims (sub, role, iss, aud, exp)", () => {
    const token = authService.signToken({ userId: "usr_op_1", role: UserRole.OPERATOR, email: "op@disc.internal", expiresInSeconds: 3600 });
    const res = authService.verifyToken(`Bearer ${token}`);
    assert.ok(res.ok);
    assert.equal(res.principal.userId, "usr_op_1");
    assert.equal(res.principal.role, UserRole.OPERATOR);
  });

  it("2. Rejects tampered signature (SIGNATURE_TAMPER_REJECTION)", () => {
    const token = authService.signToken({ userId: "usr_op_1", role: UserRole.OPERATOR, email: "op@disc.internal" });
    const parts = token.split(".");
    // Tamper with payload (elevate role to ADMIN)
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "usr_op_1", role: "ADMIN", iss: "discovery-auth-service", aud: "discovery-platform-api" })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = authService.verifyToken(`Bearer ${tamperedToken}`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.ok(res.error.includes("Signature verification failed"));
  });

  it("3. Rejects expired token (TOKEN_EXPIRATION)", () => {
    const token = authService.signToken({ userId: "usr_op_1", role: UserRole.OPERATOR, email: "op@disc.internal", expiresInSeconds: 10 });
    // Advance clock by 20 seconds
    const futureAuthService = new CryptographicAuthService({ clock: () => new Date(baseTime.getTime() + 20000) });
    const res = futureAuthService.verifyToken(`Bearer ${token}`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
    assert.ok(res.error.includes("expired"));
  });

  it("4. Server-Side RBAC: VIEWER blocked from mutations (403 FORBIDDEN)", () => {
    const viewerToken = authService.signToken({ userId: "usr_view_1", role: UserRole.VIEWER, email: "view@disc.internal" });
    const authRes = authService.verifyToken(`Bearer ${viewerToken}`);
    assert.ok(authRes.ok);

    const authz = authService.authorizeAction(authRes.principal, RoutePermission.MUTATE_PORTFOLIO);
    assert.equal(authz.ok, false);
    assert.equal(authz.status, 403);
  });
});
