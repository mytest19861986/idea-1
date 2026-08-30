import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthBoundaryService, UserRole, RoutePermission } from "../src/security/auth-boundary-service.mjs";

describe("PROD-READINESS-001: P0-001 Auth Boundary & RBAC Enforcement", () => {
  const authService = new AuthBoundaryService();

  it("1. Missing or invalid token rejects with 401 UNAUTHORIZED", () => {
    assert.equal(authService.authenticateSession(null).status, 401);
    assert.equal(authService.authenticateSession("Bearer invalid").status, 401);
  });

  it("2. Valid operator token authenticates successfully", () => {
    const res = authService.authenticateSession("Bearer token-operator");
    assert.ok(res.ok);
    assert.equal(res.principal.role, UserRole.OPERATOR);
  });

  it("3. RBAC: VIEWER role is blocked from MUTATE_PORTFOLIO (403 FORBIDDEN)", () => {
    const viewerRes = authService.authenticateSession("Bearer token-viewer");
    const authz = authService.authorizeAction(viewerRes.principal, RoutePermission.MUTATE_PORTFOLIO);
    assert.equal(authz.ok, false);
    assert.equal(authz.status, 403);
  });

  it("4. RBAC: OPERATOR role is authorized for MUTATE_PORTFOLIO and RESOLVE_INVESTIGATION", () => {
    const opRes = authService.authenticateSession("Bearer token-operator");
    assert.ok(authService.authorizeAction(opRes.principal, RoutePermission.MUTATE_PORTFOLIO).ok);
    assert.ok(authService.authorizeAction(opRes.principal, RoutePermission.RESOLVE_INVESTIGATION).ok);
  });
});
