import crypto from "node:crypto";
import { deepFreeze } from "../discovery/discovery-intake.mjs";

/**
 * ============================================================================
 * CRYPTOGRAPHIC AUTHENTICATION & RBAC SERVICE (PROD-READINESS-001R / P0-001)
 * Standards-compliant HMAC-SHA256 Token Verification (Algorithm Allowlist: HS256)
 * Strict Expiration, Issuer, Audience, Signature Tamper Rejection & Server RBAC.
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
  VIEW_PUBLIC: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.ANALYST, UserRole.VIEWER],
  CONTROL_DISCOVERY: [UserRole.ADMIN, UserRole.OPERATOR]
});

export class CryptographicAuthService {
  constructor({
    secretKey,
    verificationKeys = [],
    issuer = "discovery-auth-service",
    audience = "discovery-platform-api",
    clock = () => new Date()
  } = {}) {
    if (!secretKey || typeof secretKey !== "string" || secretKey.trim().length < 16) {
      throw new TypeError("AUTH_SECRET_REQUIRED: secretKey must be a non-empty string with minimum 16 characters");
    }
    this.secretKey = secretKey;
    this.verificationKeys = [secretKey, ...verificationKeys];
    this.issuer = issuer;
    this.audience = audience;
    this.clock = clock;
    this.allowedAlgorithms = ["HS256"];
  }

  /**
   * Generates a signed cryptographic JWT-style token.
   */
  signToken({ userId, role = UserRole.VIEWER, email, expiresInSeconds = 3600 }) {
    if (!Object.values(UserRole).includes(role)) {
      throw new TypeError(`INVALID_ROLE: Role '${role}' is not recognized in UserRole schema.`);
    }
    const now = Math.floor(this.clock().getTime() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: userId,
      role,
      email,
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      exp: now + expiresInSeconds
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", this.secretKey)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    return `${headerB64}.${payloadB64}.${sig}`;
  }

  /**
   * Authenticates and verifies cryptographic token integrity.
   */
  verifyToken(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Missing or malformed Bearer token." };
    }

    const token = authHeader.substring(7).trim();
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Malformed JWT token structure." };
    }

    const [headerB64, payloadB64, signature] = parts;

    // 1. Verify Algorithm Allowlist
    let header;
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    } catch {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Invalid header encoding." };
    }

    if (!this.allowedAlgorithms.includes(header.alg)) {
      return { ok: false, status: 401, error: `UNAUTHORIZED: Disallowed algorithm ${header.alg}.` };
    }

    // 2. Cryptographic Signature Tamper Rejection (Supports Multi-Key Rolling Secret Rotation)
    let signatureValid = false;
    for (const key of this.verificationKeys) {
      const expectedSig = crypto.createHmac("sha256", key)
        .update(`${headerB64}.${payloadB64}`)
        .digest("base64url");

      if (signature.length === expectedSig.length &&
          crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        signatureValid = true;
        break;
      }
    }

    if (!signatureValid) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Signature verification failed (TAMPERED)." };
    }

    // 3. Payload Claims Validation (exp, iss, aud, sub, role)
    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Invalid payload encoding." };
    }

    if (!payload.iss || !payload.aud || !payload.exp || !payload.sub || !payload.role) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Missing required JWT claims (iss, aud, exp, sub, role)." };
    }

    if (!Object.values(UserRole).includes(payload.role)) {
      return { ok: false, status: 401, error: `UNAUTHORIZED: Invalid role claim '${payload.role}'.` };
    }

    const now = Math.floor(this.clock().getTime() / 1000);
    if (payload.exp < now) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Token has expired." };
    }

    if (payload.iss !== this.issuer) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Invalid token issuer." };
    }

    if (payload.aud !== this.audience) {
      return { ok: false, status: 401, error: "UNAUTHORIZED: Invalid token audience." };
    }

    return deepFreeze({
      ok: true,
      principal: {
        userId: payload.sub,
        role: payload.role,
        email: payload.email || null
      }
    });
  }

  /**
   * Server-Side RBAC Enforcement (Zero Client-Side Authority).
   */
  authorizeAction(principal, requiredRoleList) {
    if (!principal || !principal.role) {
      return { ok: false, status: 403, error: "FORBIDDEN: Unauthenticated principal." };
    }

    if (!requiredRoleList.includes(principal.role)) {
      return {
        ok: false,
        status: 403,
        error: `FORBIDDEN: Principal role '${principal.role}' lacks required permissions.`
      };
    }

    return { ok: true };
  }

  /**
   * Server-Side RBAC Data Projection & Strict Allowlist (PRODUCT-EXPANSION-001-FIXSET-01)
   * Enforces fail-closed allowlist per role: any novel/unmapped field is DENIED to VIEWER by construction.
   * Redacts confidential opportunities and derived scores entirely for unprivileged VIEWERs.
   */
  projectOpportunityForRole(opportunity, role = UserRole.VIEWER) {
    if (!opportunity || typeof opportunity !== "object") throw new TypeError("opportunity is required");
    const isPrivileged = [UserRole.ADMIN, UserRole.OPERATOR, UserRole.ANALYST].includes(role);

    // If confidential and viewer: return strictly redacted stub with score stripped
    if (opportunity.isConfidential && !isPrivileged) {
      return deepFreeze({
        opportunityId: opportunity.opportunityId,
        title: "[CONFIDENTIAL OPPORTUNITY]",
        summary: "[REDACTED - PRIVILEGED ACCESS REQUIRED]",
        score: null,
        isConfidential: true,
        accessState: "REDACTED"
      });
    }

    // Explicit allowlist projection for VIEWER (Fail-Closed by Construction)
    if (!isPrivileged) {
      const publicCitations = Array.isArray(opportunity.citations)
        ? opportunity.citations.map(c => ({ sourceId: c.sourceId, url: c.url }))
        : [];

      const publicCompetitors = Array.isArray(opportunity.competitors)
        ? opportunity.competitors.map(c => ({ name: c.name, type: c.type, pricingModel: c.pricingModel }))
        : [];

      return deepFreeze({
        opportunityId: opportunity.opportunityId,
        slug: opportunity.slug,
        title: opportunity.title,
        summary: opportunity.summary,
        score: opportunity.score,
        scoringModelVersion: opportunity.scoringModelVersion || null,
        evidenceConfidence: typeof opportunity.evidenceConfidence === "number" ? opportunity.evidenceConfidence : null,
        confidenceBreakdown: opportunity.confidenceBreakdown || null,
        corroborationStatus: opportunity.corroborationStatus || "UNCONFIRMED",
        freshnessStatus: opportunity.freshnessStatus || "UNKNOWN",
        isConfidential: false,
        category: opportunity.category,
        market: opportunity.market,
        publishedAt: opportunity.publishedAt,
        tractionMetrics: Array.isArray(opportunity.tractionMetrics) ? [...opportunity.tractionMetrics] : [],
        competitors: publicCompetitors,
        marketGaps: Array.isArray(opportunity.marketGaps) ? [...opportunity.marketGaps] : [],
        localization: opportunity.localization || null,
        monetization: opportunity.monetization || null,
        complexity: opportunity.complexity || null,
        regulatoryRisk: opportunity.regulatoryRisk || null,
        contradictions: Array.isArray(opportunity.contradictions) ? [...opportunity.contradictions] : [],
        unknownFactors: Array.isArray(opportunity.unknownFactors) ? [...opportunity.unknownFactors] : [],
        citations: publicCitations,
        accessState: "PUBLIC_AUTHORIZED"
      });
    }

    // Privileged roles get complete opportunity record
    return deepFreeze({ ...opportunity, accessState: "PRIVILEGED_AUTHORIZED" });
  }
}
