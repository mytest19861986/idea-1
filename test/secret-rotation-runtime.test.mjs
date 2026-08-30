import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CryptographicAuthService, UserRole, RoutePermission } from "../src/security/auth-boundary-service.mjs";

describe("PROD-MATURITY-001: Multi-Key Secret Rotation Runtime Validation", () => {
  const primarySecret = "primary-auth-secret-key-phase-1-32bytes!";
  const secondarySecret = "secondary-auth-secret-key-phase-2-32bytes!";
  const obsoleteSecret = "obsolete-auth-secret-key-phase-0-32bytes!";

  it("1. Generates tokens with primary secret and verifies against primary", () => {
    const auth = new CryptographicAuthService({ secretKey: primarySecret });
    const token = auth.signToken({ userId: "usr-001", role: UserRole.OPERATOR, email: "op@discovery.local" });
    const res = auth.verifyToken(`Bearer ${token}`);
    assert.ok(res.ok);
    assert.equal(res.principal.role, UserRole.OPERATOR);
  });

  it("2. Rolling Rotation: Service configured with secondarySecret signs new tokens while accepting primarySecret tokens", () => {
    const oldAuth = new CryptographicAuthService({ secretKey: primarySecret });
    const oldToken = oldAuth.signToken({ userId: "usr-legacy", role: UserRole.ADMIN, email: "admin@discovery.local" });

    // New service with rotated secret + verificationKeys containing old secret
    const rotatedAuth = new CryptographicAuthService({
      secretKey: secondarySecret,
      verificationKeys: [primarySecret]
    });

    // 1. Old token signed by primarySecret is accepted
    const oldTokenVerify = rotatedAuth.verifyToken(`Bearer ${oldToken}`);
    assert.ok(oldTokenVerify.ok, "Old token must be accepted during rotation window");
    assert.equal(oldTokenVerify.principal.userId, "usr-legacy");

    // 2. New token signed by secondarySecret is accepted
    const newToken = rotatedAuth.signToken({ userId: "usr-new", role: UserRole.OPERATOR, email: "new@discovery.local" });
    const newTokenVerify = rotatedAuth.verifyToken(`Bearer ${newToken}`);
    assert.ok(newTokenVerify.ok, "New token must be accepted");
    assert.equal(newTokenVerify.principal.userId, "usr-new");

    // 3. Token signed with untrusted obsolete secret is strictly rejected
    const untrustedAuth = new CryptographicAuthService({ secretKey: obsoleteSecret });
    const untrustedToken = untrustedAuth.signToken({ userId: "usr-bad", role: UserRole.ADMIN, email: "bad@evil.local" });
    const untrustedVerify = rotatedAuth.verifyToken(`Bearer ${untrustedToken}`);
    assert.equal(untrustedVerify.ok, false);
    assert.equal(untrustedVerify.status, 401);
  });
});
