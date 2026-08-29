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

export function createReadApiServer({ provider, logger = false } = {}) {
  const readProvider = assertProvider(provider);
  const app = Fastify({ logger });
  app.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
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
  return app;
}

