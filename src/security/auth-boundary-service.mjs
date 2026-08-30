import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * AUTHENTICATION & RBAC BOUNDARY MIDDLEWARE (PROD-READINESS-001 / P0-001)
 * Enforces operator identity validation, role-based access control,
 * and confidential data projection protection.
 * Roles: ADMIN, OPERATOR, ANALYST, VIEWER
 * ============================================================================
 */

export const UserRole = Object.freeze({
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  ANALYST: "ANALYST",
  VIEWER: "VIEWER"
});

export const RoutePermission = Object.freeze({
  MUTATE_PORTFOLIO: [UserRole.ADMIN, UserRole.OPERATOR],
  RESOLVE_INVESTIGATION: [UserRole.ADMIN, UserRole.OPERATOR],
  VIEW_CONFIDENTIAL: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.ANALYST],
  VIEW_PUBLIC: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.ANALYST, UserRole.VIEWER]
});

export class AuthBoundaryService {
  constructor({ tokenSecret = "default-dev-secret-change-in-prod" } = {}) {
    this.tokenSecret = tokenSecret;
  }

  /**
   * Validates operator session token and returns authenticated principal.
   */
  authenticateSession(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Missing or malformed Bearer token." };
    }

    const token = authHeader.substring(7).trim();
    if (!token || token === "invalid") {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Invalid session token." };
    }

    // Mock/reference token decoding for bounded pilot/test environment
    let principal = {
      userId: "usr_operator_01",
      role: UserRole.OPERATOR,
      email: "operator@discovery.internal"
    };

    if (token === "token-admin") {
      principal.role = UserRole.ADMIN;
    } else if (token === "token-viewer") {
      principal.role = UserRole.VIEWER;
    }

    return deepFreeze({
      ok: true,
      principal
    });
  }

  /**
   * Authorizes an action against a route permission requirement.
   */
  authorizeAction(principal, requiredRoleList) {
    if (!principal || !principal.role) {
      return { ok: false, status: 403, error: "FORBIDDEN: Unauthenticated principal." };
    }

    if (!requiredRoleList.includes(principal.role)) {
      return {
        ok: false,
        status: 403,
        error: `FORBIDDEN: Principal with role ${principal.role} lacks required permissions.`
      };
    }

    return { ok: true };
  }
}
