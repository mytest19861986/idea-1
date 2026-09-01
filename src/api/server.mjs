import Fastify from "fastify";
import { parseOpportunityListQuery, toPublicOpportunity } from "./read-contract.mjs";

const securityHeaders = Object.freeze({
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer"
});

function isInputError(error) {
  return error instanceof TypeError || error instanceof RangeError;
}

function assertProvider(provider) {
  if (!provider || typeof provider.list !== "function" || typeof provider.getBySlug !== "function") {
    throw new TypeError("provider must implement list and getBySlug");
  }
  return provider;
}

export function createReadApiServer({ provider, discoveryController = null, authService = null, logger = false } = {}) {
  const readProvider = assertProvider(provider);
  const app = Fastify({ logger });
  app.addHook("onSend", async (request, reply) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      if (name === "content-security-policy" && (request.url === "/" || request.url.startsWith("/client-i18n.js"))) {
        reply.header(
          "content-security-policy",
          "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'"
        );
      } else {
        reply.header(name, value);
      }
    }
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/v1/opportunities", async (request, reply) => {
    try {
      const query = parseOpportunityListQuery(request.query);
      const page = await readProvider.list(query);
      if (!page || !Array.isArray(page.items)) throw new TypeError("provider returned an invalid page");
      return { items: page.items.map(toPublicOpportunity), nextCursor: page.nextCursor ?? null };
    } catch (error) {
      if (isInputError(error)) return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: error.message } });
      request.log.error(error);
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "internal server error" } });
    }
  });
  app.get("/api/v1/opportunities/:slug", async (request, reply) => {
    try {
      const record = await readProvider.getBySlug(request.params.slug);
      if (!record) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "opportunity was not found" } });
      return toPublicOpportunity(record);
    } catch (error) {
      if (isInputError(error)) return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: error.message } });
      request.log.error(error);
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "internal server error" } });
    }
  });

  // Live Discovery Control Endpoints (LOCAL-LIVE-DISCOVERY-001)
  app.get("/api/v1/discovery/status", async (_request, reply) => {
    if (!discoveryController) {
      return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Discovery controller not initialized" } });
    }
    return discoveryController.getStatus();
  });

  app.post("/api/v1/discovery/control", async (request, reply) => {
    if (!discoveryController) {
      return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Discovery controller not initialized" } });
    }
    if (authService) {
      const authHeader = request.headers.authorization;
      const authResult = authService.verifyToken(authHeader);
      if (!authResult.ok) {
        return reply.code(authResult.status || 401).send({ error: { code: "UNAUTHORIZED", message: authResult.error } });
      }
      const authz = authService.authorizeAction(authResult.principal, ["ADMIN", "OPERATOR"]);
      if (!authz.ok) {
        return reply.code(authz.status || 403).send({ error: { code: "FORBIDDEN", message: authz.error } });
      }
    }
    const { mode } = request.body || {};
    try {
      return discoveryController.setMode(mode);
    } catch (err) {
      return reply.code(400).send({ error: { code: "INVALID_MODE", message: err.message } });
    }
  });

  app.post("/api/v1/discovery/run-now", async (request, reply) => {
    if (!discoveryController) {
      return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Discovery controller not initialized" } });
    }
    if (authService) {
      const authHeader = request.headers.authorization;
      const authResult = authService.verifyToken(authHeader);
      if (!authResult.ok) {
        return reply.code(authResult.status || 401).send({ error: { code: "UNAUTHORIZED", message: authResult.error } });
      }
      const authz = authService.authorizeAction(authResult.principal, ["ADMIN", "OPERATOR"]);
      if (!authz.ok) {
        return reply.code(authz.status || 403).send({ error: { code: "FORBIDDEN", message: authz.error } });
      }
    }
    return discoveryController.runNow();
  });

  return app;
}

